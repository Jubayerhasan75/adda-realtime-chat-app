import mongoose from 'mongoose';
import { ERROR_CODES, SERVER_EVENTS } from '@chat/shared';
import { Attachment } from '../models/Attachment.js';
import { Conversation } from '../models/Conversation.js';
import { ConversationMember } from '../models/ConversationMember.js';
import { Friendship, pairKeyOf } from '../models/Friendship.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { notFriends, receiptsShared, requireMember, visibleTo } from './conversationAccess.js';
import { serializeMessage, serializeMessages } from './messageView.js';
import { emitToUser } from './realtime.js';
import { blockedIdsFor, canMessage } from './relationshipService.js';
import { toPublicUser } from './userService.js';

const DUPLICATE_KEY = 11000;
const LIST_LIMIT = 100;
const UNREAD_CAP = 100; // shown as "99+"

function peerView(peer) {
  if (!peer || peer.status !== 'active') {
    return {
      id: peer ? String(peer._id) : null,
      username: null,
      displayName: 'Deleted account',
      bio: '',
      avatar: null,
    };
  }
  return toPublicUser(peer);
}

/**
 * Builds the list items for a set of my membership rows: a fixed number of batched queries,
 * plus one "last visible message" lookup and one bounded unread count per conversation.
 */
async function summarize(me, members) {
  if (members.length === 0) return [];
  const conversationIds = members.map((m) => m.conversationId);

  const [conversations, peerMembers, peers, friendships, blocked] = await Promise.all([
    Conversation.find({ _id: { $in: conversationIds } }).select('lastSeq'),
    ConversationMember.find({ conversationId: { $in: conversationIds }, userId: { $ne: me._id } }),
    User.find({ _id: { $in: members.map((m) => m.peerId) } }),
    Friendship.find({ userIds: me._id, status: 'accepted' }).select('userIds'),
    blockedIdsFor(me._id),
  ]);

  const byId = (docs, key = '_id') => new Map(docs.map((doc) => [String(doc[key]), doc]));
  const conversationById = byId(conversations);
  const peerMemberByConversation = byId(peerMembers, 'conversationId');
  const peerById = byId(peers);
  const friendIds = new Set(
    friendships.flatMap((f) => f.userIds.map(String)).filter((id) => id !== String(me._id)),
  );
  const blockedIds = new Set(blocked.map(String));

  return Promise.all(
    members.map(async (member) => {
      const peer = peerById.get(String(member.peerId));
      const peerMember = peerMemberByConversation.get(String(member.conversationId));
      const [lastMessage, unreadCount] = await Promise.all([
        Message.findOne(visibleTo(member)).sort({ seq: -1 }),
        Message.countDocuments(
          {
            ...visibleTo(member),
            seq: { $gt: Math.max(member.readUpToSeq, member.clearedUpToSeq) },
            senderId: { $ne: me._id },
            unsentAt: null,
          },
          { limit: UNREAD_CAP },
        ),
      ]);
      const peerId = String(member.peerId);
      return {
        id: String(member.conversationId),
        peer: peerView(peer),
        lastSeq: conversationById.get(String(member.conversationId))?.lastSeq ?? 0,
        lastMessage: lastMessage ? await serializeMessage(lastMessage) : null,
        unreadCount,
        myState: {
          deliveredUpToSeq: member.deliveredUpToSeq,
          readUpToSeq: member.readUpToSeq,
          mutedUntil: member.mutedUntil,
          muted: Boolean(member.mutedUntil && member.mutedUntil > new Date()),
          accent: member.accent,
        },
        peerState: {
          deliveredUpToSeq: peerMember?.deliveredUpToSeq ?? 0,
          ...(receiptsShared(me, peer) ? { readUpToSeq: peerMember?.readUpToSeq ?? 0 } : {}),
        },
        canMessage: peer?.status === 'active' && friendIds.has(peerId) && !blockedIds.has(peerId),
      };
    }),
  );
}

/** Tells the other member how far I have received/read (respecting receipt privacy). */
async function sendReceipt(me, member) {
  const peer = await User.findById(member.peerId);
  emitToUser(member.peerId, SERVER_EVENTS.RECEIPT_UPDATE, {
    conversationId: String(member.conversationId),
    userId: String(me._id),
    deliveredUpToSeq: member.deliveredUpToSeq,
    ...(receiptsShared(me, peer) ? { readUpToSeq: member.readUpToSeq } : {}),
  });
}

/** My read position moved forward: update the other person's ticks and my other devices. */
async function announceRead(me, member) {
  await sendReceipt(me, member);
  emitToUser(me._id, SERVER_EVENTS.CONVERSATION_READ_SYNC, {
    conversationId: String(member.conversationId),
    readUpToSeq: member.readUpToSeq,
  });
}

/**
 * @param {{ logger: import('pino').Logger, media: ReturnType<import('./mediaService.js').createMediaService>,
 *   push?: ReturnType<import('./pushService.js').createPushService> }} deps
 */
export function createConversationService({ logger, media, push }) {
  return {
    /** My conversations that have at least one message, most recent first. */
    async listConversations(me) {
      const members = await ConversationMember.find({
        userId: me._id,
        lastMessageAt: { $ne: null },
      })
        .sort({ lastMessageAt: -1 })
        .limit(LIST_LIMIT);
      return summarize(me, members);
    },

    async getConversation(me, conversationId) {
      const [summary] = await summarize(me, [await requireMember(me, conversationId)]);
      return summary;
    },

    /** Opens (or creates) the one direct conversation with a friend. Safe to call repeatedly. */
    async openDirectConversation(me, peerUserId) {
      if (String(me._id) === String(peerUserId)) {
        throw new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'You can’t message yourself');
      }
      const peer = await User.findOne({ _id: peerUserId, status: 'active' });
      if (!peer) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'User not found');
      if (!(await canMessage(me._id, peer._id))) throw notFriends();

      const directKey = pairKeyOf(me._id, peer._id);
      let conversation;
      try {
        conversation = await Conversation.findOneAndUpdate(
          { directKey },
          { $setOnInsert: { directKey, participantIds: directKey.split(':') } },
          { upsert: true, returnDocument: 'after' },
        );
      } catch (err) {
        if (err.code !== DUPLICATE_KEY) throw err;
        conversation = await Conversation.findOne({ directKey }); // created concurrently
      }

      for (const [userId, peerId] of [
        [me._id, peer._id],
        [peer._id, me._id],
      ]) {
        try {
          await ConversationMember.updateOne(
            { conversationId: conversation._id, userId },
            { $setOnInsert: { conversationId: conversation._id, userId, peerId } },
            { upsert: true },
          );
        } catch (err) {
          if (err.code !== DUPLICATE_KEY) throw err;
        }
      }
      return this.getConversation(me, conversation._id);
    },

    /**
     * Visible message history in seq order (no side effects: never changes read state, which is
     * why the long-press preview can use it). `before` loads older pages, `after` newer ones.
     */
    async listMessages(me, conversationId, { before, after, limit }) {
      const member = await requireMember(me, conversationId);
      const filter = visibleTo(member);
      let sort = { seq: -1 };
      if (before !== undefined) filter.seq = { $gt: member.clearedUpToSeq, $lt: before };
      if (after !== undefined) {
        filter.seq = { $gt: Math.max(after, member.clearedUpToSeq) };
        sort = { seq: 1 };
      }
      const page = await Message.find(filter)
        .sort(sort)
        .limit(limit + 1);
      const hasMore = page.length > limit;
      const messages = await serializeMessages(page.slice(0, limit));
      if (sort.seq === -1) messages.reverse();
      return { messages, hasMore };
    },

    /**
     * Stores a message exactly once and fans it out (docs/ARCHITECTURE.md §7):
     * the same clientMessageId from the same sender always returns the original message.
     * The content is an end-to-end encrypted envelope the server can't read
     * (docs/E2EE.md §3), plus ids of photos/videos uploaded first.
     * @returns {Promise<{ message: object, duplicate: boolean }>}
     */
    async sendMessage(me, input) {
      const { conversationId, clientMessageId, envelope, replyToId, attachmentIds } = input;
      const existing = await Message.findOne({ senderId: me._id, clientMessageId });
      if (existing) {
        if (String(existing.conversationId) !== String(conversationId)) {
          throw new AppError(409, ERROR_CODES.INVALID_STATE, 'Message id already used');
        }
        return { message: await serializeMessage(existing), duplicate: true };
      }

      const member = await requireMember(me, conversationId);
      if (!(await canMessage(me._id, member.peerId))) throw notFriends();
      if (replyToId) {
        const original = await Message.findOne({ _id: replyToId, conversationId });
        if (!original || original.unsentAt) {
          throw new AppError(400, ERROR_CODES.INVALID_STATE, 'You can’t reply to this message');
        }
      }
      const attachments = attachmentIds?.length
        ? await media.readyForMessage(me, conversationId, attachmentIds)
        : [];
      const type = attachments.length ? 'media' : 'e2ee';

      let created;
      try {
        // Retried automatically by the driver on transient write conflicts (concurrent sends).
        await mongoose.connection.transaction(async (session) => {
          const conversation = await Conversation.findOneAndUpdate(
            { _id: conversationId },
            { $inc: { lastSeq: 1 } },
            { returnDocument: 'after', session },
          );
          const seq = conversation.lastSeq;
          [created] = await Message.create(
            [
              {
                conversationId,
                seq,
                senderId: me._id,
                clientMessageId,
                type,
                envelope,
                attachments: attachments.map((a) => ({
                  attachmentId: a._id,
                  kind: a.kind,
                  mimeType: a.mimeType,
                  width: a.width,
                  height: a.height,
                  durationMs: a.durationMs,
                  size: a.size,
                })),
                replyToId: replyToId ?? null,
              },
            ],
            { session },
          );
          if (attachments.length) {
            // Each upload can be sent once; a concurrent send of the same files aborts here.
            const claimed = await Attachment.updateMany(
              { _id: { $in: attachments.map((a) => a._id) }, status: 'ready' },
              { $set: { status: 'attached', messageId: created._id, expiresAt: null } },
              { session },
            );
            if (claimed.modifiedCount !== attachments.length) {
              throw new AppError(409, ERROR_CODES.INVALID_STATE, 'These files were already sent');
            }
          }
          await Conversation.updateOne(
            { _id: conversationId },
            { $set: { lastMessageId: created._id, lastMessageAt: created.createdAt } },
            { session },
          );
          await ConversationMember.updateMany(
            { conversationId },
            { $set: { lastMessageAt: created.createdAt } },
            { session },
          );
          // Replying means I have seen the conversation: everything up to my message is read.
          await ConversationMember.updateOne(
            { _id: member._id },
            { $max: { deliveredUpToSeq: seq, readUpToSeq: seq } },
            { session },
          );
        });
      } catch (err) {
        if (err.code === DUPLICATE_KEY && err.keyPattern?.clientMessageId) {
          return this.sendMessage(me, input); // lost a retry race
        }
        throw err;
      }

      const message = await serializeMessage(created);
      emitToUser(me._id, SERVER_EVENTS.MESSAGE_NEW, { message });
      emitToUser(member.peerId, SERVER_EVENTS.MESSAGE_NEW, { message });
      // Not awaited: sending to push services must never slow down or fail the send.
      push
        ?.messageSent({ message: created, sender: me, recipientId: member.peerId })
        .catch((err) => logger.warn({ err }, 'Push failed'));
      if (member.readUpToSeq < message.seq - 1) {
        await announceRead(me, await ConversationMember.findById(member._id));
      }
      return { message, duplicate: false };
    },

    /** My device received everything up to `upToSeq` (clamped to what exists). */
    async markDelivered(me, conversationId, upToSeq) {
      const member = await requireMember(me, conversationId);
      const { lastSeq } = await Conversation.findById(conversationId).select('lastSeq');
      const target = Math.min(upToSeq, lastSeq);
      const updated = await ConversationMember.findOneAndUpdate(
        { _id: member._id, deliveredUpToSeq: { $lt: target } },
        { $set: { deliveredUpToSeq: target } },
        { returnDocument: 'after' },
      );
      if (updated) await sendReceipt(me, updated);
      return { deliveredUpToSeq: (updated ?? member).deliveredUpToSeq };
    },

    /** I have seen everything up to `upToSeq`: clears unread and syncs my other devices. */
    async markRead(me, conversationId, upToSeq) {
      const member = await requireMember(me, conversationId);
      const { lastSeq } = await Conversation.findById(conversationId).select('lastSeq');
      const target = Math.min(upToSeq, lastSeq);
      const updated = await ConversationMember.findOneAndUpdate(
        { _id: member._id, readUpToSeq: { $lt: target } },
        { $set: { readUpToSeq: target }, $max: { deliveredUpToSeq: target } },
        { returnDocument: 'after' },
      );
      if (updated) await announceRead(me, updated);
      return { readUpToSeq: (updated ?? member).readUpToSeq };
    },

    /** Relays "typing…" to the other member while messaging is allowed. */
    async setTyping(me, conversationId, isTyping) {
      const member = await requireMember(me, conversationId);
      if (!(await canMessage(me._id, member.peerId))) return;
      emitToUser(member.peerId, SERVER_EVENTS.TYPING_UPDATE, {
        conversationId: String(conversationId),
        userId: String(me._id),
        isTyping,
      });
    },

    /** "Clear chat": hides every current message for me only (the other person keeps theirs). */
    async clearChat(me, conversationId) {
      const member = await requireMember(me, conversationId);
      const { lastSeq } = await Conversation.findById(conversationId).select('lastSeq');
      const updated = await ConversationMember.findOneAndUpdate(
        { _id: member._id },
        { $max: { clearedUpToSeq: lastSeq, readUpToSeq: lastSeq, deliveredUpToSeq: lastSeq } },
        { returnDocument: 'after' },
      );
      if (updated.readUpToSeq > member.readUpToSeq) await announceRead(me, updated);
      emitToUser(me._id, SERVER_EVENTS.CONVERSATION_UPDATED, {
        conversationId: String(conversationId),
      });
      return this.getConversation(me, conversationId);
    },

    /**
     * "Delete chat" (for me only): clears every message for me and removes the chat from my
     * list. The other person keeps theirs. If they write again, the chat comes back with only
     * the new messages, like WhatsApp.
     */
    async deleteChat(me, conversationId) {
      await this.clearChat(me, conversationId);
      await ConversationMember.updateOne(
        { conversationId, userId: me._id },
        { $set: { lastMessageAt: null } },
      );
      emitToUser(me._id, SERVER_EVENTS.CONVERSATION_UPDATED, {
        conversationId: String(conversationId),
      });
    },

    /** My mute and color for this chat only; synced to my other devices. */
    async updateSettings(me, conversationId, changes) {
      const member = await requireMember(me, conversationId);
      await ConversationMember.updateOne({ _id: member._id }, { $set: changes });
      emitToUser(me._id, SERVER_EVENTS.CONVERSATION_UPDATED, {
        conversationId: String(conversationId),
      });
      return this.getConversation(me, conversationId);
    },
  };
}
