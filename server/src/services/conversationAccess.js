import mongoose from 'mongoose';
import { ERROR_CODES } from '@chat/shared';
import { ConversationMember } from '../models/ConversationMember.js';
import { AppError } from '../utils/AppError.js';
import { emitToUser } from './realtime.js';
import { canMessage } from './relationshipService.js';

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

/** Group conversations have no single peer (docs/GROUPS.md). */
export const isGroupMember = (member) => !member.peerId;

/**
 * May I post in this conversation? Direct: only while we're friends and nobody blocked anyone.
 * Group: being a member is enough (people you aren't friends with can share a group).
 */
export async function canSend(me, member) {
  if (isGroupMember(member)) return true;
  return canMessage(me._id, member.peerId);
}

/** User ids of everyone currently in a conversation. */
export async function memberIdsOf(conversationId) {
  const members = await ConversationMember.find({ conversationId }).select('userId');
  return members.map((member) => member.userId);
}

/** Sends a live event to every member's devices (optionally not to some of them). */
export async function emitToMembers(conversationId, event, payload, { except = [] } = {}) {
  const skip = new Set(except.map(String));
  for (const userId of await memberIdsOf(conversationId)) {
    if (!skip.has(String(userId))) emitToUser(userId, event, payload);
  }
}
