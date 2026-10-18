import mongoose from 'mongoose';
import { ERROR_CODES } from '@chat/shared';
import { ConversationMember } from '../models/ConversationMember.js';
import { AppError } from '../utils/AppError.js';

// A conversation or message you can't access looks exactly like one that doesn't exist.
export const conversationNotFound = () =>
  new AppError(404, ERROR_CODES.NOT_FOUND, 'Conversation not found');
export const messageNotFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, 'Message not found');
export const notFriends = () =>
  new AppError(403, ERROR_CODES.NOT_FRIENDS, 'You can only message your friends');

/** The membership row is the single proof of access (docs/DATABASE.md §2.7). */
export async function requireMember(me, conversationId) {
  if (!mongoose.isValidObjectId(conversationId)) throw conversationNotFound();
  const member = await ConversationMember.findOne({ conversationId, userId: me._id });
  if (!member) throw conversationNotFound();
  return member;
}

/** Read receipts are reciprocal: shown only if both people have them on (D6). */
export const receiptsShared = (me, peer) =>
  Boolean(me.settings?.privacy?.readReceipts && peer?.settings?.privacy?.readReceipts);

/** Messages this member can see: after their "clear chat" point and not deleted for them. */
export function visibleTo(member) {
  return {
    conversationId: member.conversationId,
    seq: { $gt: member.clearedUpToSeq },
    hiddenFor: { $ne: member.userId },
  };
}
