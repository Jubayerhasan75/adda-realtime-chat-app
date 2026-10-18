import mongoose from 'mongoose';
import { ERROR_CODES, SERVER_EVENTS } from '@chat/shared';
import { Attachment } from '../models/Attachment.js';
import { Conversation } from '../models/Conversation.js';
import { ConversationMember } from '../models/ConversationMember.js';
import { Friendship, pairKeyOf } from '../models/Friendship.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import {
  canSend,
  emitToMembers,
  isGroupMember,
  memberIdsOf,
  notFriends,
  receiptsShared,
  requireMember,
  visibleTo,
} from './conversationAccess.js';
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

export function groupPhotoView(conversation) {
  return conversation.photo
    ? `/api/media/${conversation.photo.attachmentId}?variant=avatar&v=${conversation.photo.v ?? 1}`
    : null;
}

/**
 * Builds the list items for a set of my membership rows: a fixed number of batched queries,
 * plus one "last visible message" lookup and one bounded unread count per conversation.
 * Direct chats carry `peer`; groups carry `group` (name, photo, members with their roles).
 * `memberStates` = how far each other member has received/read (for the ticks).
 */
async function summarize(me, members) {
  if (members.length === 0) return [];
  const conversationIds = members.map((m) => m.conversationId);

  const [conversations, otherMembers, friendships, blocked] = await Promise.all([
    Conversation.find({ _id: { $in: conversationIds } }).select(
      'type lastSeq name photo keyEpoch rotationNeeded',
    ),
    ConversationMember.find({ conversationId: { $in: conversationIds }, userId: { $ne: me._id } }),
    Friendship.find({ userIds: me._id, status: 'accepted' }).select('userIds'),
    blockedIdsFor(me._id),
  ]);
  const users = await User.find({
    _id: {
      $in: [
        ...new Set([
          ...otherMembers.map((m) => String(m.userId)),
          ...members.filter((m) => m.peerId).map((m) => String(m.peerId)),
        ]),
      ],
    },
  });

  const byId = (docs, key = '_id') => new Map(docs.map((doc) => [String(doc[key]), doc]));
  const conversationById = byId(conversations);
  const userById = byId(users);
  const othersByConversation = new Map();
  for (const other of otherMembers) {
    const list = othersByConversation.get(String(other.conversationId)) ?? [];
    list.push(other);
    othersByConversation.set(String(other.conversationId), list);
  }
  const friendIds = new Set(
    friendships.flatMap((f) => f.userIds.map(String)).filter((id) => id !== String(me._id)),
  );
  const blockedIds = new Set(blocked.map(String));

  /** One other member's receipt position; "read" only where both share read receipts. */
  const stateOf = (other) => {
    const user = userById.get(String(other.userId));
    return {
      userId: String(other.userId),
      deliveredUpToSeq: other.deliveredUpToSeq ?? 0,
      ...(receiptsShared(me, user) ? { readUpToSeq: other.readUpToSeq ?? 0 } : {}),
    };
  };

  return Promise.all(
    members.map(async (member) => {
      const conversation = conversationById.get(String(member.conversationId));
      const others = othersByConversation.get(String(member.conversationId)) ?? [];
      const [lastMessage, unreadCount] = await Promise.all([
        Message.findOne(visibleTo(member)).sort({ seq: -1 }),
        Message.countDocuments(
          {
            ...visibleTo(member),
            seq: { $gt: Math.max(member.readUpToSeq, member.clearedUpToSeq) },
            senderId: { $ne: me._id },
            unsentAt: null,
            type: { $ne: 'system' },
          },
          { limit: UNREAD_CAP },
        ),
      ]);
      const common = {
        id: String(member.conversationId),
        type: conversation?.type ?? 'direct',
        lastSeq: conversation?.lastSeq ?? 0,
        lastMessage: lastMessage ? await serializeMessage(lastMessage) : null,
        unreadCount,
        myState: {
          deliveredUpToSeq: member.deliveredUpToSeq,
          readUpToSeq: member.readUpToSeq,
          mutedUntil: member.mutedUntil,
          muted: Boolean(member.mutedUntil && member.mutedUntil > new Date()),
          accent: member.accent,
        },
      };

      if (isGroupMember(member)) {
        return {
          ...common,
          peer: null,
          group: {
            name: conversation?.name ?? 'Group',
            photo: conversation ? groupPhotoView(conversation) : null,
            myRole: member.role,
            keyEpoch: conversation?.keyEpoch ?? 0,
            rotationNeeded: Boolean(conversation?.rotationNeeded),
            members: [
              { ...toPublicUser(me), role: member.role },
              ...others.map((other) => ({
                ...peerView(userById.get(String(other.userId))),
                id: String(other.userId),
                role: other.role,
              })),
            ],
          },
          memberStates: others.map(stateOf),
          canMessage: true,
        };
      }

      const peerMember = others[0];
      const peer = userById.get(String(member.peerId));
      const peerId = String(member.peerId);
      return {
        ...common,
        peer: peerView(peer),
        peerState: {
          deliveredUpToSeq: peerMember?.deliveredUpToSeq ?? 0,
          ...(receiptsShared(me, peer) ? { readUpToSeq: peerMember?.readUpToSeq ?? 0 } : {}),
        },
        memberStates: peerMember ? [stateOf(peerMember)] : [],
        canMessage: peer?.status === 'active' && friendIds.has(peerId) && !blockedIds.has(peerId),
      };
    }),
  );
}

/**
 * Tells the other members how far I have received/read. Read positions go only to people who
 * share read receipts with me (both have them on).
 */
async function sendReceipt(me, member) {
  const recipients = isGroupMember(member)
    ? (await memberIdsOf(member.conversationId)).filter((id) => !id.equals(me._id))
    : [member.peerId];
  const users = await User.find({ _id: { $in: recipients } }).select('settings');
  for (const user of users) {
    emitToUser(user._id, SERVER_EVENTS.RECEIPT_UPDATE, {
      conversationId: String(member.conversationId),
      userId: String(me._id),
      deliveredUpToSeq: member.deliveredUpToSeq,
      ...(receiptsShared(me, user) ? { readUpToSeq: member.readUpToSeq } : {}),
    });
  }
}

/** My read position moved forward: update the other people's ticks and my other devices. */
async function announceRead(me, member) {
  await sendReceipt(me, member);
  emitToUser(me._id, SERVER_EVENTS.CONVERSATION_READ_SYNC, {
    conversationId: String(member.conversationId),
    readUpToSeq: member.readUpToSeq,
  });
}

const badEnvelope = () =>
  new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'Wrong message format for this chat');

/** Group messages must use the current group key; direct ones the pairwise format. */
export async function checkEnvelope(member, envelope) {
  if (!isGroupMember(member)) {
    if (envelope.v !== 1) throw badEnvelope();
    return;
  }
  if (envelope.v !== 2) throw badEnvelope();
  const conversation = await Conversation.findById(member.conversationId).select(
    'keyEpoch rotationNeeded',
  );
  if (conversation.rotationNeeded) {
    throw new AppError(409, ERROR_CODES.GROUP_KEY_ROTATION_NEEDED, 'The group needs a new key');
  }
  if (envelope.e !== conversation.keyEpoch) {
    throw new AppError(409, ERROR_CODES.GROUP_KEY_OUTDATED, 'The group key changed');
  }
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
     * Messages with photos/videos that I can still see, newest first (for "Media and links").
     * Their details and keys are inside the encrypted envelopes, opened on the device.
     */
    async listMedia(me, conversationId, { before, limit }) {
      const member = await requireMember(me, conversationId);
      const filter = {
        ...visibleTo(member),
        type: 'media',
        unsentAt: null,
        'attachments.0': { $exists: true },
      };
      if (before !== undefined) filter.seq = { $gt: member.clearedUpToSeq, $lt: before };
      const page = await Message.find(filter)
        .sort({ seq: -1 })
        .limit(limit + 1);
      return {
        messages: await serializeMessages(page.slice(0, limit)),
        hasMore: page.length > limit,
      };
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
      if (!(await canSend(me, member))) throw notFriends();
      await checkEnvelope(member, envelope);
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
      const memberIds = await memberIdsOf(conversationId);
      for (const userId of memberIds) emitToUser(userId, SERVER_EVENTS.MESSAGE_NEW, { message });
      // Not awaited: sending to push services must never slow down or fail the send.
      for (const recipientId of memberIds.filter((id) => !id.equals(me._id))) {
        push
          ?.messageSent({ message: created, sender: me, recipientId })
          .catch((err) => logger.warn({ err }, 'Push failed'));
      }
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

    /** Relays "typing…" to the other members while messaging is allowed. */
    async setTyping(me, conversationId, isTyping) {
      const member = await requireMember(me, conversationId);
      if (!(await canSend(me, member))) return;
      await emitToMembers(
        conversationId,
        SERVER_EVENTS.TYPING_UPDATE,
        { conversationId: String(conversationId), userId: String(me._id), isTyping },
        { except: [me._id] },
      );
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
