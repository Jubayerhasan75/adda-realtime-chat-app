import { CLIENT_EVENTS } from '@chat/shared';
import { useSyncExternalStore } from 'react';
import { getConnectedSocket } from '../realtime/socketStore.js';

/** Receivers drop "typing…" if it isn't refreshed, so a lost "stop" can't stick forever. */
const TYPING_EXPIRY_MS = 6_000;
const SEND_INTERVAL_MS = 3_000;
const IDLE_STOP_MS = 5_000;

const typing = new Map(); // conversationId → Map<userId, expiry timer>
const snapshots = new Map(); // conversationId → user ids (stable between changes)
const listeners = new Set();
const NOBODY = Object.freeze([]);

function emit(conversationId) {
  snapshots.delete(conversationId);
  listeners.forEach((listener) => listener());
}

/** Called for every `typing:update` from the server. */
export function receiveTyping({ conversationId, userId = 'peer', isTyping }) {
  const people = typing.get(conversationId) ?? new Map();
  clearTimeout(people.get(userId));
  if (isTyping) {
    people.set(
      userId,
      setTimeout(() => stopTyping(conversationId, userId), TYPING_EXPIRY_MS),
    );
  } else {
    people.delete(userId);
  }
  if (people.size) typing.set(conversationId, people);
  else typing.delete(conversationId);
  emit(conversationId);
}

function stopTyping(conversationId, userId) {
  const people = typing.get(conversationId);
  if (!people?.has(userId)) return;
  clearTimeout(people.get(userId));
  people.delete(userId);
  if (people.size === 0) typing.delete(conversationId);
  emit(conversationId);
}

/** Clears an indicator (expired, or the person's message arrived). Without a user: everyone. */
export function clearTyping(conversationId, userId) {
  if (userId) {
    stopTyping(conversationId, userId);
    return;
  }
  const people = typing.get(conversationId);
  if (!people) return;
  people.forEach((timer) => clearTimeout(timer));
  typing.delete(conversationId);
  emit(conversationId);
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Who is typing in this conversation right now (user ids). */
export function useTypingUsers(conversationId) {
  return useSyncExternalStore(subscribe, () => {
    if (!typing.has(conversationId)) return NOBODY;
    if (!snapshots.has(conversationId)) {
      snapshots.set(conversationId, [...typing.get(conversationId).keys()]);
    }
    return snapshots.get(conversationId);
  });
}

/** True while someone else is typing in this conversation. */
export function useIsTyping(conversationId) {
  return useSyncExternalStore(subscribe, () => typing.has(conversationId));
}

/**
 * Sends my own typing state: at most one "start" every 3 s while typing, and "stop" after
 * 5 s without a keystroke, on send, or when leaving the conversation.
 */
export function createTypingNotifier(conversationId) {
  let lastStartAt = 0;
  let idleTimer = null;
  let typing = false;

  const send = (event) => getConnectedSocket()?.emit(event, { conversationId });

  const stop = () => {
    clearTimeout(idleTimer);
    if (!typing) return;
    typing = false;
    lastStartAt = 0;
    send(CLIENT_EVENTS.TYPING_STOP);
  };

  return {
    keystroke() {
      const now = Date.now();
      if (now - lastStartAt > SEND_INTERVAL_MS) {
        lastStartAt = now;
        typing = true;
        send(CLIENT_EVENTS.TYPING_START);
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(stop, IDLE_STOP_MS);
    },
    stop,
  };
}
