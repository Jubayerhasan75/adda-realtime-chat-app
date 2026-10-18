import mongoose from 'mongoose';
import { ERROR_CODES, LIMITS, SERVER_EVENTS } from '@chat/shared';
import { ConversationMember } from '../models/ConversationMember.js';
import { Message } from '../models/Message.js';
import { AppError } from '../utils/AppError.js';
import {
  canSend,
  isGroupMember,
  memberIdsOf,
  messageNotFound,
  notFriends,
  requireMember,
  visibleTo,
} from './conversationAccess.js';
import { serializeMessage, serializeMessages } from './messageView.js';
import { emitToUser } from './realtime.js';

const MINUTE = 60 * 1000;
const EDIT_WINDOW_MS = LIMITS.MESSAGE_EDIT_WINDOW_MINUTES * MINUTE;
const UNSEND_WINDOW_MS = LIMITS.MESSAGE_UNSEND_WINDOW_HOURS * 60 * MINUTE;

const notYours = (action) =>
  new AppError(403, ERROR_CODES.FORBIDDEN, `You can only ${action} your own messages`);
const unsentAlready = () => new AppError(409, ERROR_CODES.INVALID_STATE, 'This message was unsent');

/** Group notices ("Nadia added Arif") can't be reacted to, pinned or unsent. */
function requireNotSystem(message) {
  if (message.type === 'system') {
    throw new AppError(409, ERROR_CODES.INVALID_STATE, 'This message can’t be changed');
  }
}

/**
 * Loads a message for a member of its conversation. Messages in other people's chats, deleted
 * for me, or cleared by me all look like they don't exist.
 */
async function loadVisible(me, messageId) {
  if (!mongoose.isValidObjectId(messageId)) throw messageNotFound();
  const message = await Message.findById(messageId);
  if (!message) throw messageNotFound();
  const member = await ConversationMember.findOne({
    conversationId: message.conversationId,
    userId: me._id,
  });
  const hidden = message.hiddenFor.some((id) => id.equals(me._id));
  if (!member || hidden || message.seq <= member.clearedUpToSeq) throw messageNotFound();
  return { message, member };
}

/** Sends the new state of a changed message to everyone in the conversation. */
async function broadcastUpdate(message, member) {
  const serialized = await serializeMessage(message);
  for (const userId of await memberIdsOf(member.conversationId)) {
    emitToUser(userId, SERVER_EVENTS.MESSAGE_UPDATED, { message: serialized });
  }
  return serialized;
}

/** Changing content (edit, react) requires still being allowed to post in the chat. */
async function requireCanMessage(me, member) {
  if (!(await canSend(me, member))) throw notFriends();
}

/** An edit must use the chat's kind of encryption (pairwise or group key). */
function requireEnvelopeKind(member, envelope) {
  if ((envelope.v === 2) !== isGroupMember(member)) {
    throw new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'Wrong message format for this chat');
  }
}

/**
 * @param {{ logger: import('pino').Logger, media: ReturnType<import('./mediaService.js').createMediaService> }} deps
 */
export function createMessageService({ media }) {
  return {
    /**
     * Edits my own message within 15 minutes by replacing its encrypted envelope (the server
     * never sees the new text). No edit history is kept (D8).
     */
    async edit(me, messageId, envelope) {
      const { message, member } = await loadVisible(me, messageId);
      if (!message.senderId.equals(me._id)) throw notYours('edit');
      if (message.unsentAt) throw unsentAlready();
      if (message.type === 'media' || message.type === 'system') {
        throw new AppError(409, ERROR_CODES.INVALID_STATE, 'This message can’t be edited');
      }
      requireEnvelopeKind(member, envelope);
      if (Date.now() - message.createdAt > EDIT_WINDOW_MS) {
        throw new AppError(
          409,
          ERROR_CODES.EDIT_WINDOW_CLOSED,
          `Messages can only be edited for ${LIMITS.MESSAGE_EDIT_WINDOW_MINUTES} minutes`,
        );
      }
      await requireCanMessage(me, member);
      const updated = await Message.findOneAndUpdate(
        { _id: message._id, unsentAt: null },
        { $set: { envelope, editedAt: new Date() }, $inc: { version: 1 } },
        { returnDocument: 'after' },
      );
      if (!updated) throw unsentAlready();
      return broadcastUpdate(updated, member);
    },

    /**
     * scope "me": hide it on my devices only.
     * scope "everyone" (unsend, my own messages, within 24 h): the text, photos/videos, GIF,
     * reactions and pin are removed from the server for both people and a "Message unsent"
     * placeholder remains (D7).
     */
    async remove(me, messageId, scope) {
      const { message, member } = await loadVisible(me, messageId);

      if (scope === 'me') {
        await Message.updateOne({ _id: message._id }, { $addToSet: { hiddenFor: me._id } });
        emitToUser(me._id, SERVER_EVENTS.MESSAGE_HIDDEN, {
          conversationId: String(message.conversationId),
          messageId: String(message._id),
        });
        return null;
      }

      requireNotSystem(message);
      if (!message.senderId.equals(me._id)) throw notYours('unsend');
      if (message.unsentAt) return serializeMessage(message);
      if (Date.now() - message.createdAt > UNSEND_WINDOW_MS) {
        throw new AppError(
          409,
          ERROR_CODES.INVALID_STATE,
          `Messages can only be unsent for ${LIMITS.MESSAGE_UNSEND_WINDOW_HOURS} hours`,
        );
      }
      const updated = await Message.findOneAndUpdate(
        { _id: message._id, unsentAt: null },
        {
          $set: {
            unsentAt: new Date(),
            text: null,
            envelope: null,
            attachments: [],
            gif: null,
            reactions: [],
            pinnedAt: null,
            pinnedBy: null,
          },
          $inc: { version: 1 },
        },
        { returnDocument: 'after' },
      );
      const serialized = await broadcastUpdate(updated ?? message, member);
      await media.releaseMessageMedia(message._id);
      return serialized;
    },

    /** One reaction per person per message; reacting again replaces it. */
    async react(me, messageId, emoji) {
      const { message, member } = await loadVisible(me, messageId);
      if (message.unsentAt) throw unsentAlready();
      requireNotSystem(message);
      await requireCanMessage(me, member);

      await Message.updateOne({ _id: message._id }, { $pull: { reactions: { userId: me._id } } });
      const updated = await Message.findOneAndUpdate(
        { _id: message._id },
        { $push: { reactions: { userId: me._id, emoji, at: new Date() } }, $inc: { version: 1 } },
        { returnDocument: 'after' },
      );
      return broadcastUpdate(updated, member);
    },

    async unreact(me, messageId) {
      const { message, member } = await loadVisible(me, messageId);
      const updated = await Message.findOneAndUpdate(
        { _id: message._id, 'reactions.userId': me._id },
        { $pull: { reactions: { userId: me._id } }, $inc: { version: 1 } },
        { returnDocument: 'after' },
      );
      return updated ? broadcastUpdate(updated, member) : serializeMessage(message);
    },

    /** Either person may pin; at most 10 pinned messages per conversation. */
    async pin(me, messageId) {
      const { message, member } = await loadVisible(me, messageId);
      if (message.unsentAt) throw unsentAlready();
      requireNotSystem(message);
      if (message.pinnedAt) return serializeMessage(message);
      const pinned = await Message.countDocuments({
        conversationId: message.conversationId,
        pinnedAt: { $type: 'date' },
        unsentAt: null,
      });
      if (pinned >= LIMITS.MAX_PINNED_MESSAGES) {
        throw new AppError(
          409,
          ERROR_CODES.INVALID_STATE,
          `You can pin up to ${LIMITS.MAX_PINNED_MESSAGES} messages. Unpin one first.`,
        );
      }
      const updated = await Message.findOneAndUpdate(
        { _id: message._id, unsentAt: null },
        { $set: { pinnedAt: new Date(), pinnedBy: me._id }, $inc: { version: 1 } },
        { returnDocument: 'after' },
      );
      if (!updated) throw unsentAlready();
      return broadcastUpdate(updated, member);
    },

    async unpin(me, messageId) {
      const { message, member } = await loadVisible(me, messageId);
      if (!message.pinnedAt) return serializeMessage(message);
      const updated = await Message.findOneAndUpdate(
        { _id: message._id },
        { $set: { pinnedAt: null, pinnedBy: null }, $inc: { version: 1 } },
        { returnDocument: 'after' },
      );
      return broadcastUpdate(updated, member);
    },

    async listPins(me, conversationId) {
      const member = await requireMember(me, conversationId);
      const pins = await Message.find({
        ...visibleTo(member),
        pinnedAt: { $type: 'date' },
        unsentAt: null,
      })
        .sort({ pinnedAt: -1 })
        .limit(LIMITS.MAX_PINNED_MESSAGES);
      return serializeMessages(pins);
    },
  };
}
