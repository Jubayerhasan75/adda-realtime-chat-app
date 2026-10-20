import { apiRequest } from '../../lib/http.js';
import { openFromGroup, sealForGroup } from './groupKeys.js';
import { decryptFromEnvelope, encryptForPeer, getKeyring } from './keyring.js';

/**
 * Turns the server's encrypted messages into readable ones on this device, and readable content
 * into envelopes before it leaves (docs/E2EE.md §3). Decrypted messages live only in memory.
 */

const peers = new Map(); // conversationId → the other member's user id (direct chats)
const groupIds = new Set(); // conversations that are groups
const REPLY_SNIPPET = 120;

export function rememberPeer(conversationId, peerId) {
  if (conversationId && peerId) peers.set(String(conversationId), String(peerId));
}

/** Remembers what kind of chat this is (from the list or a summary). */
export function rememberConversation(conversation) {
  if (!conversation) return;
  if (conversation.type === 'group') groupIds.add(String(conversation.id));
  else rememberPeer(conversation.id, conversation.peer?.id);
}

export function rememberPeers(conversations) {
  for (const conversation of conversations ?? []) rememberConversation(conversation);
}

const fetchConversation = (conversationId) => apiRequest(`/api/conversations/${conversationId}`);

/** The other person in a direct conversation (from the list, or asked once). */
export async function peerIdFor(conversationId) {
  if (!peers.has(conversationId)) rememberConversation(await fetchConversation(conversationId));
  return peers.get(conversationId);
}

/** Current members of a group, asked fresh (a new group key must reach all of them). */
async function groupMemberIds(conversationId) {
  const conversation = await fetchConversation(conversationId);
  return conversation.group.members.map((member) => member.id);
}

const myUserId = () => getKeyring()?.userId;

async function decryptContent({ envelope, conversationId, senderId, clientMessageId }) {
  if (envelope.v === 2) {
    return openFromGroup({ envelope, groupId: conversationId, senderId, clientMessageId });
  }
  const me = myUserId();
  const peerId = senderId === me ? await peerIdFor(conversationId) : senderId;
  return decryptFromEnvelope({
    envelope,
    conversationId,
    senderId,
    clientMessageId,
    peerId,
    myUserId: me,
  });
}

/** "image" | "video" | "gif" | null — for "📷 Photo"-style labels. */
const mediaKindOf = (content) => (content?.gif ? 'gif' : (content?.attachments?.[0]?.kind ?? null));

async function openReplyQuote(replyTo, conversationId) {
  if (!replyTo) return null;
  if (replyTo.unsent || !replyTo.envelope) return { ...replyTo, text: null, mediaKind: null };
  try {
    const content = await decryptContent({
      envelope: replyTo.envelope,
      conversationId,
      senderId: replyTo.senderId,
      clientMessageId: replyTo.clientMessageId,
    });
    return {
      ...replyTo,
      text: content.text ? content.text.slice(0, REPLY_SNIPPET) : null,
      mediaKind: mediaKindOf(content),
    };
  } catch {
    return { ...replyTo, text: null, mediaKind: null, undecryptable: true };
  }
}

/**
 * A server message made readable: `text`, `gif` and (for photos/videos) the decrypted
 * attachment details. If it can't be decrypted on this device it is marked `undecryptable`
 * instead of failing the whole chat.
 */
export async function openMessage(message) {
  if (!message || message.opened) return message;
  const replyTo = await openReplyQuote(message.replyTo, message.conversationId);
  const base = { ...message, replyTo, opened: true, text: null, gif: null };
  if (message.unsentAt) return base;
  // Not encrypted (only old or test data; the server no longer accepts plain messages).
  if (!message.envelope) return { ...base, text: message.text ?? null, gif: message.gif ?? null };
  try {
    const content = await decryptContent(message);
    return {
      ...base,
      text: typeof content.text === 'string' ? content.text : null,
      gif: content.gif ?? null,
      // Photos/videos: the server lists the uploads; their details and keys are encrypted.
      attachments: mergeAttachments(message.attachments, content.attachments),
    };
  } catch {
    return { ...base, undecryptable: true };
  }
}

function mergeAttachments(stored = [], decrypted = []) {
  if (!decrypted?.length) return stored;
  // End-to-end encrypted files: every detail comes from the message; the server only lists
  // their encrypted parts. A file whose parts the server doesn't list isn't shown.
  if (decrypted.some((item) => Array.isArray(item.parts))) {
    const storedIds = new Set(stored.map((item) => item.id));
    return decrypted.filter(
      (item) => Array.isArray(item.parts) && item.parts.every((id) => storedIds.has(id)),
    );
  }
  const byId = new Map(decrypted.map((item) => [item.id, item]));
  return stored.map((item) => ({ ...item, ...byId.get(item.id) }));
}

export const openMessages = (messages) => Promise.all((messages ?? []).map(openMessage));

/** Readable conversation summary (its last message decrypted). */
export async function openConversation(conversation) {
  if (!conversation) return conversation;
  rememberConversation(conversation);
  return { ...conversation, lastMessage: await openMessage(conversation.lastMessage) };
}

/** Content → envelope for the other member, or for the group (docs/GROUPS.md §3). */
export async function sealContent({ conversationId, clientMessageId, content }) {
  if (!groupIds.has(conversationId) && !peers.has(conversationId)) {
    rememberConversation(await fetchConversation(conversationId));
  }
  if (groupIds.has(conversationId)) {
    return sealForGroup({
      groupId: conversationId,
      memberIds: () => groupMemberIds(conversationId),
      senderId: myUserId(),
      clientMessageId,
      content,
    });
  }
  return encryptForPeer({
    conversationId,
    peerId: await peerIdFor(conversationId),
    senderId: myUserId(),
    clientMessageId,
    content,
  });
}
