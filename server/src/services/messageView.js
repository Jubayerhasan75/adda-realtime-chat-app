import { Message } from '../models/Message.js';

/** The quoted original of a reply: its encrypted envelope, decrypted by the devices. */
function replyPreview(original) {
  if (!original) return null;
  const unsent = Boolean(original.unsentAt);
  return {
    id: String(original._id),
    senderId: String(original.senderId),
    clientMessageId: original.clientMessageId,
    envelope: unsent ? null : (original.envelope ?? null),
    unsent,
  };
}

/**
 * Attachments are referenced by id only; the client loads them through
 * GET /api/media/:id, which checks access every time. Storage keys never leave the server.
 */
function attachmentView(attachment) {
  return {
    id: String(attachment.attachmentId),
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    width: attachment.width,
    height: attachment.height,
    durationMs: attachment.durationMs,
    size: attachment.size,
  };
}

/**
 * What clients see of a message (docs/API.md §2.7). The same for both participants, so it can
 * be broadcast; per-viewer state (`hiddenFor`) is never included. Unsent messages keep only
 * their place in the conversation: no envelope, media, reactions, reply quote or pin.
 */
export function toMessage(message, replyTo = null) {
  const unsent = Boolean(message.unsentAt);
  return {
    id: String(message._id),
    conversationId: String(message.conversationId),
    seq: message.seq,
    senderId: String(message.senderId),
    clientMessageId: message.clientMessageId,
    type: message.type,
    envelope: unsent ? null : (message.envelope ?? null),
    attachments: unsent ? [] : (message.attachments ?? []).map(attachmentView),
    replyTo: unsent ? null : replyPreview(replyTo),
    reactions: unsent
      ? []
      : message.reactions.map((reaction) => ({
          userId: String(reaction.userId),
          emoji: reaction.emoji,
        })),
    editedAt: message.editedAt,
    unsentAt: message.unsentAt,
    pinnedAt: unsent ? null : message.pinnedAt,
    version: message.version,
    createdAt: message.createdAt,
  };
}

/** Serializes many messages, loading the quoted originals of replies in one query. */
export async function serializeMessages(messages) {
  const replyIds = messages.map((m) => m.replyToId).filter(Boolean);
  const originals = replyIds.length
    ? await Message.find({ _id: { $in: replyIds } }).select(
        'senderId clientMessageId envelope unsentAt',
      )
    : [];
  const byId = new Map(originals.map((original) => [String(original._id), original]));
  return messages.map((message) => toMessage(message, byId.get(String(message.replyToId))));
}

export async function serializeMessage(message) {
  const [serialized] = await serializeMessages([message]);
  return serialized;
}
