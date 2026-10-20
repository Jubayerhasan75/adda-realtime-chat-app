import mongoose from 'mongoose';
import { SERVER_EVENTS } from '@chat/shared';
import { Conversation } from '../models/Conversation.js';
import { ConversationMember } from '../models/ConversationMember.js';
import { Message } from '../models/Message.js';
import { emitToMembers } from './conversationAccess.js';
import { serializeMessage } from './messageView.js';
import { emitToUser } from './realtime.js';

/**
 * Adds a notice ("Nadia added Arif", "Nadia changed the chat color") as the next message.
 * `envelope` + `clientMessageId` carry encrypted details (a nickname) the server can't read.
 */
export async function addSystemMessage(
  conversationId,
  actorId,
  system,
  session,
  { envelope = null, clientMessageId } = {},
) {
  const conversation = await Conversation.findOneAndUpdate(
    { _id: conversationId },
    { $inc: { lastSeq: 1 } },
    { returnDocument: 'after', session },
  );
  const [message] = await Message.create(
    [
      {
        conversationId,
        seq: conversation.lastSeq,
        senderId: actorId,
        clientMessageId: clientMessageId ?? new mongoose.Types.ObjectId().toHexString(),
        type: 'system',
        system,
        envelope,
      },
    ],
    { session },
  );
  await Conversation.updateOne(
    { _id: conversationId },
    { $set: { lastMessageId: message._id, lastMessageAt: message.createdAt } },
    { session },
  );
  await ConversationMember.updateMany(
    { conversationId },
    { $set: { lastMessageAt: message.createdAt } },
    { session },
  );
  return message;
}

/** After a change: the notice goes to everyone, and every member's view refreshes. */
export async function announce(conversationId, message, alsoNotify = []) {
  const payload = { message: await serializeMessage(message) };
  await emitToMembers(conversationId, SERVER_EVENTS.MESSAGE_NEW, payload);
  await emitToMembers(conversationId, SERVER_EVENTS.CONVERSATION_UPDATED, {
    conversationId: String(conversationId),
  });
  for (const userId of alsoNotify) {
    emitToUser(userId, SERVER_EVENTS.CONVERSATION_REMOVED, {
      conversationId: String(conversationId),
    });
  }
}
