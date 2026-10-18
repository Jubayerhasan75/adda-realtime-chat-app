import mongoose from 'mongoose';
import { ERROR_CODES, LIMITS, SERVER_EVENTS } from '@chat/shared';
import { Attachment } from '../models/Attachment.js';
import { AuthToken } from '../models/AuthToken.js';
import { Block } from '../models/Block.js';
import { ConversationMember } from '../models/ConversationMember.js';
import { Friendship } from '../models/Friendship.js';
import { KeyBackup } from '../models/KeyBackup.js';
import { Notification } from '../models/Notification.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { verifyPassword } from '../utils/passwords.js';
import { recordAudit } from './auditService.js';
import { emitToUser, endSessions } from './realtime.js';

const DUPLICATE_KEY = 11000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Profile photo URL. It goes through the authorization check in GET /api/media/:id; the
 * version changes whenever the photo does, so browsers never show a stale cached one.
 */
export function avatarUrl(user) {
  const avatar = user.avatar;
  if (!avatar?.attachmentId) return null;
  return `/api/media/${avatar.attachmentId}?variant=avatar&v=${avatar.version ?? 0}`;
}

/** What other people may see about a user (docs/DATABASE.md §2.1). */
export function toPublicUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    displayName: user.displayName,
    bio: user.bio ?? '',
    avatar: avatarUrl(user),
  };
}

/** The signed-in user's own view of their account. Never includes the password hash. */
export function toPrivateUser(user) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    username: user.username,
    usernameChangedAt: user.usernameChangedAt,
    displayName: user.displayName,
    bio: user.bio,
    avatar: avatarUrl(user),
    settings: user.settings.toObject(),
    createdAt: user.createdAt,
  };
}

/** Converts a nested partial object into Mongo `$set` dot-paths: {a: {b: 1}} → {'a.b': 1}. */
function toDotPaths(value, prefix = '') {
  return Object.entries(value).reduce((paths, [key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      Object.assign(paths, toDotPaths(child, path));
    } else {
      paths[path] = child;
    }
    return paths;
  }, {});
}

/**
 * @param {{ logger: import('pino').Logger, presence?: ReturnType<import('./presenceService.js').createPresenceService> }} deps
 */
export function createUserService({ logger, presence }) {
  return {
    async updateProfile(user, changes) {
      const updated = await User.findByIdAndUpdate(
        user._id,
        { $set: changes },
        { returnDocument: 'after' },
      );
      return toPrivateUser(updated);
    },

    async changeUsername(user, username, client) {
      if (username === user.username) return toPrivateUser(user);

      const cooldownMs = LIMITS.USERNAME_CHANGE_COOLDOWN_DAYS * DAY_MS;
      if (user.usernameChangedAt && Date.now() - user.usernameChangedAt < cooldownMs) {
        throw new AppError(
          429,
          ERROR_CODES.RATE_LIMITED,
          `You can change your username once every ${LIMITS.USERNAME_CHANGE_COOLDOWN_DAYS} days`,
        );
      }

      try {
        const updated = await User.findByIdAndUpdate(
          user._id,
          { $set: { username, usernameChangedAt: new Date() } },
          { returnDocument: 'after' },
        );
        await recordAudit(logger, 'username_changed', { userId: user._id, ...client });
        return toPrivateUser(updated);
      } catch (err) {
        if (err.code !== DUPLICATE_KEY) throw err;
        throw new AppError(409, ERROR_CODES.USERNAME_TAKEN, 'This username is already taken');
      }
    },

    async updateSettings(user, patch) {
      const updated = await User.findByIdAndUpdate(
        user._id,
        { $set: toDotPaths({ settings: patch }) },
        { returnDocument: 'after', runValidators: true },
      );
      // Who may see my online status / last seen may have changed.
      if (patch.privacy?.onlineStatus || patch.privacy?.lastSeen) {
        await presence?.settingsChanged(String(user._id));
      }
      return updated.settings.toObject();
    },

    /**
     * Deletes the account (docs/DATABASE.md §4–5): the user becomes an anonymous tombstone so
     * other people's message history still resolves to "Deleted account"; sessions and
     * pending email links, friendships, blocks and notifications are removed, and the profile
     * photo, unsent uploads and push subscriptions are deleted. Photos/videos already sent stay
     * in the other person's chat history.
     */
    async deleteAccount(user, password, client) {
      const withHash = await User.findById(user._id).select('+passwordHash');
      if (!(await verifyPassword(withHash.passwordHash, password))) {
        throw new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'Incorrect password', [
          { path: 'password', issue: 'Incorrect password' },
        ]);
      }

      const sessionIds = await Session.find({ userId: user._id }).distinct('_id');
      const relationships = await Friendship.find({ userIds: user._id }).select('userIds');
      const affectedUserIds = relationships.flatMap((f) =>
        f.userIds.filter((id) => !id.equals(user._id)),
      );
      await mongoose.connection.transaction(async (session) => {
        await User.updateOne(
          { _id: user._id },
          {
            $set: { status: 'deleted', deletedAt: new Date(), displayName: 'Deleted account' },
            $unset: {
              email: 1,
              username: 1,
              passwordHash: 1,
              bio: 1,
              avatar: 1,
              emailVerifiedAt: 1,
              lastSeenAt: 1,
            },
          },
          { session },
        );
        await Session.deleteMany({ userId: user._id }, { session });
        await AuthToken.deleteMany({ userId: user._id }, { session });
        await PushSubscription.deleteMany({ userId: user._id }, { session });
        // The locked private keys go; public keys stay so friends can still read old messages.
        await KeyBackup.deleteMany({ userId: user._id }, { session });
        await Friendship.deleteMany({ userIds: user._id }, { session });
        await Block.deleteMany(
          { $or: [{ blockerId: user._id }, { blockedId: user._id }] },
          { session },
        );
        await Notification.deleteMany(
          { $or: [{ userId: user._id }, { actorId: user._id }] },
          { session },
        );
        // Conversations stay readable for the other person, shown as "Deleted account".
        await ConversationMember.deleteMany({ userId: user._id }, { session });
        // Picked up by the media cleanup job, which removes the files from storage.
        await Attachment.updateMany(
          {
            ownerId: user._id,
            $or: [{ purpose: 'avatar' }, { status: { $in: ['pending', 'ready'] } }],
          },
          { $set: { status: 'deleting' } },
          { session },
        );
      });
      endSessions(sessionIds);
      for (const otherId of affectedUserIds) {
        emitToUser(otherId, SERVER_EVENTS.FRIENDSHIP_UPDATED, {
          userId: String(user._id),
          relationship: 'none',
        });
      }
      await recordAudit(logger, 'account_deleted', { userId: user._id, ...client });
    },
  };
}
