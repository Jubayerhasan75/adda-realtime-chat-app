import { Block } from '../models/Block.js';
import { Friendship, pairKeyOf } from '../models/Friendship.js';

/**
 * How `meId` relates to the other person in a friendship document:
 * friends | outgoing (I asked) | incoming (they asked) | none.
 * A declined request looks like "none" to both people (docs/DATABASE.md §2.4).
 */
export function relationshipFrom(friendship, meId) {
  if (!friendship || friendship.status === 'declined') return 'none';
  if (friendship.status === 'accepted') return 'friends';
  return friendship.requesterId.equals(meId) ? 'outgoing' : 'incoming';
}

/** @returns {Promise<{ iBlocked: boolean, blockedMe: boolean }>} */
export async function blockStatus(meId, otherId) {
  const blocks = await Block.find({
    $or: [
      { blockerId: meId, blockedId: otherId },
      { blockerId: otherId, blockedId: meId },
    ],
  }).select('blockerId');
  return {
    iBlocked: blocks.some((block) => block.blockerId.equals(meId)),
    blockedMe: blocks.some((block) => block.blockerId.equals(otherId)),
  };
}

/** Ids of everyone I blocked or who blocked me — excluded from search results. */
export async function blockedIdsFor(meId) {
  const blocks = await Block.find({ $or: [{ blockerId: meId }, { blockedId: meId }] }).select(
    'blockerId blockedId',
  );
  return blocks.map((block) => (block.blockerId.equals(meId) ? block.blockedId : block.blockerId));
}

/** Relationship of `meId` to each of `otherIds`, in one query. */
export async function relationshipsFor(meId, otherIds) {
  const friendships = await Friendship.find({
    pairKey: { $in: otherIds.map((id) => pairKeyOf(meId, id)) },
  });
  const byPair = new Map(friendships.map((friendship) => [friendship.pairKey, friendship]));
  return new Map(
    otherIds.map((id) => [String(id), relationshipFrom(byPair.get(pairKeyOf(meId, id)), meId)]),
  );
}

/**
 * Messaging is only allowed between accepted friends where neither has blocked the other
 * (docs/REQUIREMENTS.md D1).
 */
export async function canMessage(aId, bId) {
  const friendship = await Friendship.exists({ pairKey: pairKeyOf(aId, bId), status: 'accepted' });
  if (!friendship) return false;
  const { iBlocked, blockedMe } = await blockStatus(aId, bId);
  return !iBlocked && !blockedMe;
}
