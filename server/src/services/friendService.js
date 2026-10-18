import mongoose from 'mongoose';
import { ERROR_CODES, SERVER_EVENTS } from '@chat/shared';
import { Block } from '../models/Block.js';
import { Friendship, pairKeyOf } from '../models/Friendship.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { notify, removeFriendRequestNotifications } from './notificationService.js';
import { emitToUser } from './realtime.js';
import { blockStatus, relationshipFrom } from './relationshipService.js';
import { toPublicUser } from './userService.js';

const DUPLICATE_KEY = 11000;
const DECLINE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const LIST_LIMIT = 200;

// Blocked and missing users get the same answer, so a block is never revealed.
const userNotFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, 'User not found');
const requestNotFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, 'Friend request not found');

/** Someone who can take part in friendships: an active account with a verified email. */
function findReachableUser(userId) {
  if (!mongoose.isValidObjectId(userId)) return null;
  return User.findOne({ _id: userId, status: 'active', emailVerifiedAt: { $ne: null } });
}

/** Tells both people's open devices how they now relate to each other. */
function broadcastRelationship(friendship, aId, bId, overrides = {}) {
  for (const [meId, otherId] of [
    [aId, bId],
    [bId, aId],
  ]) {
    emitToUser(meId, SERVER_EVENTS.FRIENDSHIP_UPDATED, {
      userId: String(otherId),
      relationship: overrides[String(meId)] ?? relationshipFrom(friendship, meId),
    });
  }
}

/** Throws the right 409/429 for an existing friendship document, or returns it if reusable. */
function assertCanRequest(existing, meId) {
  if (existing.status === 'accepted') {
    throw new AppError(409, ERROR_CODES.ALREADY_FRIENDS, 'You are already friends');
  }
  if (existing.status === 'pending') {
    if (existing.requesterId.equals(meId)) {
      throw new AppError(409, ERROR_CODES.REQUEST_EXISTS, 'Friend request already sent');
    }
    throw new AppError(
      409,
      ERROR_CODES.REQUEST_EXISTS_INCOMING,
      'This person already sent you a request. Accept it instead.',
      [{ path: 'requestId', issue: String(existing._id) }],
    );
  }
  const declinedMyRequest = existing.requesterId.equals(meId);
  if (declinedMyRequest && Date.now() - existing.respondedAt < DECLINE_COOLDOWN_MS) {
    throw new AppError(
      429,
      ERROR_CODES.RATE_LIMITED,
      'You can’t send this person another request yet',
    );
  }
}

/** @param {{ logger: import('pino').Logger }} _deps */
export function createFriendService(_deps) {
  async function loadPending(requestId, filter) {
    if (!mongoose.isValidObjectId(requestId)) throw requestNotFound();
    const friendship = await Friendship.findOne({ _id: requestId, status: 'pending', ...filter });
    if (!friendship) throw requestNotFound();
    return friendship;
  }

  async function listPeople(friendships, meId, mapItem) {
    const otherIds = friendships.map((f) => f.userIds.find((id) => !id.equals(meId)));
    const users = await User.find({ _id: { $in: otherIds }, status: 'active' });
    const byId = new Map(users.map((user) => [String(user._id), user]));
    return friendships
      .map((friendship, index) => {
        const user = byId.get(String(otherIds[index]));
        return user ? mapItem(friendship, toPublicUser(user)) : null;
      })
      .filter(Boolean);
  }

  return {
    async sendRequest(me, targetId) {
      if (String(me._id) === String(targetId)) {
        throw new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'You can’t add yourself');
      }
      const target = await findReachableUser(targetId);
      if (!target) throw userNotFound();
      const { iBlocked, blockedMe } = await blockStatus(me._id, target._id);
      if (iBlocked || blockedMe) throw userNotFound();

      const pairKey = pairKeyOf(me._id, target._id);
      let friendship = await Friendship.findOne({ pairKey });
      if (friendship) {
        assertCanRequest(friendship, me._id);
        // A previously declined pair: reopen it as a new request from me.
        friendship = await Friendship.findOneAndUpdate(
          { _id: friendship._id, status: 'declined' },
          {
            $set: {
              status: 'pending',
              requesterId: me._id,
              recipientId: target._id,
              respondedAt: null,
            },
          },
          { returnDocument: 'after' },
        );
        if (!friendship) return this.sendRequest(me, targetId); // changed concurrently: re-evaluate
      } else {
        try {
          friendship = await Friendship.create({
            pairKey,
            userIds: [me._id, target._id].sort((a, b) => String(a).localeCompare(String(b))),
            requesterId: me._id,
            recipientId: target._id,
            status: 'pending',
          });
        } catch (err) {
          if (err.code !== DUPLICATE_KEY) throw err;
          // Both people pressed "Add" at the same moment: report the request that won.
          assertCanRequest(await Friendship.findOne({ pairKey }), me._id);
          return this.sendRequest(me, targetId);
        }
      }

      const emitNotification = await notify({
        userId: target._id,
        type: 'friend_request',
        actor: me,
        friendshipId: friendship._id,
      });
      emitNotification();
      broadcastRelationship(friendship, me._id, target._id);
      return {
        id: String(friendship._id),
        user: toPublicUser(target),
        createdAt: friendship.updatedAt,
      };
    },

    async acceptRequest(me, requestId) {
      const friendship = await loadPending(requestId, { recipientId: me._id });
      let emitNotification = () => {};
      await mongoose.connection.transaction(async (session) => {
        const updated = await Friendship.updateOne(
          { _id: friendship._id, status: 'pending' },
          { $set: { status: 'accepted', respondedAt: new Date() } },
          { session },
        );
        if (updated.modifiedCount !== 1) throw requestNotFound();
        await removeFriendRequestNotifications(friendship._id, { session });
        emitNotification = await notify(
          {
            userId: friendship.requesterId,
            type: 'friend_accepted',
            actor: me,
            friendshipId: friendship._id,
          },
          { session },
        );
      });
      friendship.status = 'accepted';
      emitNotification();
      broadcastRelationship(friendship, me._id, friendship.requesterId);
    },

    async declineRequest(me, requestId) {
      const friendship = await loadPending(requestId, { recipientId: me._id });
      const updated = await Friendship.updateOne(
        { _id: friendship._id, status: 'pending' },
        { $set: { status: 'declined', respondedAt: new Date() } },
      );
      if (updated.modifiedCount !== 1) throw requestNotFound();
      await removeFriendRequestNotifications(friendship._id);
      friendship.status = 'declined';
      broadcastRelationship(friendship, me._id, friendship.requesterId);
    },

    async cancelRequest(me, requestId) {
      const friendship = await loadPending(requestId, { requesterId: me._id });
      const deleted = await Friendship.deleteOne({ _id: friendship._id, status: 'pending' });
      if (deleted.deletedCount !== 1) throw requestNotFound();
      await removeFriendRequestNotifications(friendship._id);
      broadcastRelationship(null, me._id, friendship.recipientId);
    },

    async removeFriend(me, friendId) {
      if (!mongoose.isValidObjectId(friendId)) throw userNotFound();
      const deleted = await Friendship.deleteOne({
        pairKey: pairKeyOf(me._id, friendId),
        status: 'accepted',
      });
      if (deleted.deletedCount !== 1) throw userNotFound();
      broadcastRelationship(null, me._id, friendId);
    },

    async listFriends(me) {
      const friendships = await Friendship.find({ userIds: me._id, status: 'accepted' })
        .sort({ respondedAt: -1 })
        .limit(LIST_LIMIT);
      const friends = await listPeople(friendships, me._id, (friendship, user) => ({
        user,
        since: friendship.respondedAt,
      }));
      return friends.sort((a, b) => a.user.displayName.localeCompare(b.user.displayName));
    },

    async listRequests(me, direction) {
      const field = direction === 'incoming' ? 'recipientId' : 'requesterId';
      const friendships = await Friendship.find({ [field]: me._id, status: 'pending' })
        .sort({ updatedAt: -1 })
        .limit(LIST_LIMIT);
      return listPeople(friendships, me._id, (friendship, user) => ({
        id: String(friendship._id),
        user,
        createdAt: friendship.updatedAt,
      }));
    },

    /**
     * Blocks a user: removes any friendship or request between us, hides us from each other's
     * search, and (from Phase 6) stops messages both ways. The other person is not told.
     */
    async block(me, targetId) {
      if (String(me._id) === String(targetId)) {
        throw new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'You can’t block yourself');
      }
      if (!mongoose.isValidObjectId(targetId)) throw userNotFound();
      const target = await User.findOne({ _id: targetId, status: 'active' });
      if (!target) throw userNotFound();

      await mongoose.connection.transaction(async (session) => {
        await Block.updateOne(
          { blockerId: me._id, blockedId: target._id },
          { $setOnInsert: { blockerId: me._id, blockedId: target._id } },
          { upsert: true, session },
        );
        const friendship = await Friendship.findOneAndDelete(
          { pairKey: pairKeyOf(me._id, target._id) },
          { session },
        );
        if (friendship) await removeFriendRequestNotifications(friendship._id, { session });
      });
      broadcastRelationship(null, me._id, target._id, { [String(me._id)]: 'blocked' });
    },

    async unblock(me, targetId) {
      if (!mongoose.isValidObjectId(targetId)) throw userNotFound();
      const deleted = await Block.deleteOne({ blockerId: me._id, blockedId: targetId });
      if (deleted.deletedCount !== 1) throw userNotFound();
      emitToUser(me._id, SERVER_EVENTS.FRIENDSHIP_UPDATED, {
        userId: String(targetId),
        relationship: 'none',
      });
    },

    async listBlocked(me) {
      const blocks = await Block.find({ blockerId: me._id })
        .sort({ createdAt: -1 })
        .limit(LIST_LIMIT);
      const users = await User.find({
        _id: { $in: blocks.map((b) => b.blockedId) },
        status: 'active',
      });
      return users.map((user) => ({ user: toPublicUser(user) }));
    },
  };
}
