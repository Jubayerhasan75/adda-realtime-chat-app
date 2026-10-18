import mongoose from 'mongoose';
import { ERROR_CODES } from '@chat/shared';
import { Report } from '../models/Report.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { blockStatus, blockedIdsFor, relationshipsFor } from './relationshipService.js';
import { toPublicUser } from './userService.js';

const SEARCH_LIMIT = 20;
const DUPLICATE_KEY = 11000;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Finding people and reporting abuse. */
export function createDirectoryService() {
  return {
    /**
     * Username search: exact match first, then prefix matches ("jub" → "jubayer"). Uses the
     * username index (anchored prefix regex). Hides me, blocked users in either direction,
     * unverified accounts, and people who turned off "discoverable" — unless the query is
     * their exact username (docs/REQUIREMENTS.md D3–D4).
     */
    async search(me, q) {
      const hidden = await blockedIdsFor(me._id);
      const users = await User.find({
        username: { $regex: `^${escapeRegex(q)}` },
        _id: { $nin: [me._id, ...hidden] },
        status: 'active',
        emailVerifiedAt: { $ne: null },
        $or: [{ 'settings.privacy.discoverable': true }, { username: q }],
      })
        .sort({ username: 1 })
        .limit(SEARCH_LIMIT);

      const relationships = await relationshipsFor(
        me._id,
        users.map((user) => user._id),
      );
      return users.map((user) => ({
        user: toPublicUser(user),
        relationship: relationships.get(String(user._id)),
      }));
    },

    /** A public profile. People who blocked me look exactly like missing accounts. */
    async getProfile(me, username) {
      const user = await User.findOne({
        username,
        status: 'active',
        emailVerifiedAt: { $ne: null },
      });
      if (!user) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'User not found');
      if (user._id.equals(me._id)) return { user: toPublicUser(user), relationship: 'self' };

      const { iBlocked, blockedMe } = await blockStatus(me._id, user._id);
      if (blockedMe) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'User not found');
      if (iBlocked) return { user: toPublicUser(user), relationship: 'blocked' };

      const relationships = await relationshipsFor(me._id, [user._id]);
      return { user: toPublicUser(user), relationship: relationships.get(String(user._id)) };
    },

    /** Stores an abuse report. Reporting the same person twice is accepted but stored once. */
    async report(me, targetId, { reason, details = '' }) {
      if (String(me._id) === String(targetId)) {
        throw new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'You can’t report yourself');
      }
      if (
        !mongoose.isValidObjectId(targetId) ||
        !(await User.exists({ _id: targetId, status: 'active' }))
      ) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, 'User not found');
      }
      try {
        await Report.create({ reporterId: me._id, targetUserId: targetId, reason, details });
      } catch (err) {
        if (err.code !== DUPLICATE_KEY) throw err;
      }
    },
  };
}
