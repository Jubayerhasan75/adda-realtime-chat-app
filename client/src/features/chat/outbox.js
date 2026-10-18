import { CLIENT_EVENTS } from '@chat/shared';
import { useSyncExternalStore } from 'react';
import { apiRequest } from '../../lib/http.js';
import { openMessage, sealContent } from '../e2ee/messages.js';
import { getConnectedSocket } from '../realtime/socketStore.js';
import { outboxStorage } from './outboxStorage.js';

const ACK_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3_000;
// Errors that retrying cannot fix: show "Not sent" right away.
const PERMANENT_ERRORS = new Set([
  'NOT_FRIENDS',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'INVALID_STATE',
  'EMAIL_NOT_VERIFIED',
  'UNAUTHENTICATED',
  'PEER_NO_KEY',
  'NO_KEY',
]);

/**
 * Photos/videos are uploaded before a message enters the outbox, so an item only carries
 * their ids (plus the details needed to draw them while sending).
 * @typedef {{ clientMessageId: string, conversationId: string, userId: string, text?: string,
 *   attachments?: object[], gif?: object, replyToId?: string, createdAt: string,
 *   status: 'sending' | 'failed', attempts: number, error?: string }} OutboxItem
 */

/** @type {Map<string, OutboxItem>} */
const items = new Map();
const inFlight = new Set();
const listeners = new Set();
const snapshots = new Map();
let currentUserId = null;
let onSent = () => {};

function emit() {
  snapshots.clear();
  listeners.forEach((listener) => listener());
}

function update(item) {
  items.set(item.clientMessageId, item);
  outboxStorage.save(item);
  emit();
}

class SendError extends Error {
  constructor(message, { code, offline = false } = {}) {
    super(message);
    this.code = code;
    this.offline = offline;
  }
}

/**
 * What the server receives (docs/API.md §3.1): only the encrypted envelope, the ids of
 * uploaded files and the replied-to message. The readable content never leaves the device.
 */
function contentOf({ clientMessageId, envelope, attachments, replyToId }) {
  return {
    clientMessageId,
    envelope,
    ...(attachments?.length ? { attachmentIds: attachments.map((a) => a.id) } : {}),
    ...(replyToId ? { replyToId } : {}),
  };
}

/** Encrypts an item once; retries reuse the same envelope. */
async function sealItem(item) {
  if (item.envelope) return item;
  const content = {
    ...(item.text ? { text: item.text } : {}),
    ...(item.gif ? { gif: item.gif } : {}),
    ...(item.attachments?.length ? { attachments: item.attachments } : {}),
  };
  let envelope;
  try {
    envelope = await sealContent({
      conversationId: item.conversationId,
      clientMessageId: item.clientMessageId,
      content,
    });
  } catch (err) {
    throw new SendError(err.message, { code: err.code ?? 'NO_KEY' });
  }
  const sealed = { ...item, envelope };
  if (items.has(item.clientMessageId)) update(sealed);
  return sealed;
}

/** Sends over the live socket (acknowledged), or the REST fallback when it is down. */
async function deliver(item) {
  const { conversationId } = item;
  const payload = { conversationId, ...contentOf(item) };
  const socket = getConnectedSocket();
  if (socket) {
    let response;
    try {
      response = await socket
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck(CLIENT_EVENTS.MESSAGE_SEND, payload);
    } catch {
      throw new SendError('The server didn’t answer in time', { code: 'TIMEOUT' });
    }
    if (!response.ok) throw new SendError(response.error.message, { code: response.error.code });
    return response.data.message;
  }

  if (navigator.onLine === false) throw new SendError('You’re offline', { offline: true });
  try {
    const data = await apiRequest(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: contentOf(item),
    });
    return data.message;
  } catch (err) {
    throw new SendError(err.message, { code: err.code, offline: err.code === 'NETWORK_ERROR' });
  }
}

async function attempt(clientMessageId) {
  const item = items.get(clientMessageId);
  if (!item || item.status !== 'sending' || inFlight.has(clientMessageId)) return;
  inFlight.add(clientMessageId);
  try {
    const message = await deliver(await sealItem(item));
    // Add the stored message to the history before removing the pending copy (no flicker).
    onSent(await openMessage(message));
    items.delete(clientMessageId);
    outboxStorage.remove(clientMessageId);
    emit();
  } catch (err) {
    const current = items.get(clientMessageId);
    if (!current) return;
    // Offline: keep it queued; it is sent automatically when the connection returns.
    if (err.offline) return;
    const attempts = current.attempts + 1;
    const giveUp = PERMANENT_ERRORS.has(err.code) || attempts >= MAX_ATTEMPTS;
    update({ ...current, attempts, status: giveUp ? 'failed' : 'sending', error: err.message });
    // Same clientMessageId on every retry, so the server can never store it twice.
    if (!giveUp) setTimeout(() => attempt(clientMessageId), RETRY_DELAY_MS * attempts);
  } finally {
    inFlight.delete(clientMessageId);
  }
}

/** Loads this user's unsent messages from the device and starts sending them. */
export async function startOutbox(userId, { onMessageSent }) {
  currentUserId = userId;
  onSent = onMessageSent;
  const saved = await outboxStorage.load(userId);
  if (currentUserId !== userId) return;
  saved.forEach((item) => items.set(item.clientMessageId, item));
  emit();
  flushOutbox();
}

export function stopOutbox() {
  currentUserId = null;
  onSent = () => {};
  items.clear();
  emit();
}

/** Logout: forget unsent messages in memory and on the device. */
export async function clearOutbox() {
  stopOutbox();
  await outboxStorage.clear();
}

/** Retries everything still waiting (called when the connection comes back). */
export function flushOutbox() {
  for (const item of items.values()) {
    if (item.status === 'sending') attempt(item.clientMessageId);
  }
}

/**
 * @param {string} conversationId
 * @param {string} text the message, or a caption for attachments ('' for none)
 * @param {{ replyToId?: string, attachments?: object[], gif?: object }} [content]
 */
export function enqueueMessage(conversationId, text, { replyToId, attachments, gif } = {}) {
  const item = {
    clientMessageId: crypto.randomUUID(),
    conversationId,
    replyToId,
    userId: currentUserId,
    text,
    attachments: attachments?.length ? attachments : undefined,
    gif,
    createdAt: new Date().toISOString(),
    status: 'sending',
    attempts: 0,
  };
  update(item);
  attempt(item.clientMessageId);
}

export function retryMessage(clientMessageId) {
  const item = items.get(clientMessageId);
  if (!item) return;
  update({ ...item, status: 'sending', attempts: 0, error: undefined });
  attempt(clientMessageId);
}

export function discardMessage(clientMessageId) {
  items.delete(clientMessageId);
  outboxStorage.remove(clientMessageId);
  emit();
}

/** Unsent messages of one conversation, oldest first. */
export function useOutbox(conversationId) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => {
      if (!snapshots.has(conversationId)) {
        snapshots.set(
          conversationId,
          [...items.values()]
            .filter((item) => item.conversationId === conversationId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        );
      }
      return snapshots.get(conversationId);
    },
  );
}
