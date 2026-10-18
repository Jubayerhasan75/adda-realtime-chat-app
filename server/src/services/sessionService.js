import mongoose from 'mongoose';
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  SESSION_TOUCH_INTERVAL_MS,
} from '../config/security.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { Session } from '../models/Session.js';
import { User } from '../models/User.js';
import { describeUserAgent } from '../utils/requestInfo.js';
import { endSessions } from './realtime.js';
import { generateToken, hashToken } from '../utils/tokens.js';

/**
 * Starts a new session. Always a brand-new token, so a pre-login cookie can never be reused
 * (prevents session fixation).
 * @param {unknown} userId
 * @param {{ ipPrefix: string, userAgent: string }} client
 * @returns {Promise<{ session: InstanceType<typeof Session>, token: string }>}
 */
export async function createSession(userId, client) {
  const token = generateToken();
  const now = new Date();
  const session = await Session.create({
    userId,
    tokenHash: hashToken(token),
    csrfToken: generateToken(),
    lastUsedAt: now,
    idleExpiresAt: new Date(now.getTime() + SESSION_IDLE_MS),
    absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
    ...client,
  });
  return { session, token };
}

/**
 * Looks up the session for a cookie token. Returns null for unknown, revoked or expired
 * sessions and for deleted accounts. Extends the idle expiry when the session is used.
 * @param {string | undefined} token
 */
export async function resolveSession(token) {
  if (typeof token !== 'string' || token.length !== 43) return null;

  const now = new Date();
  const session = await Session.findOne({ tokenHash: hashToken(token), revokedAt: null });
  if (!session || session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) return null;

  const user = await User.findOne({ _id: session.userId, status: 'active' });
  if (!user) return null;

  if (now - session.lastUsedAt > SESSION_TOUCH_INTERVAL_MS) {
    session.lastUsedAt = now;
    session.idleExpiresAt = new Date(now.getTime() + SESSION_IDLE_MS);
    await session.save();
  }
  return { session, user };
}

/** The same checks as resolveSession, for a session id from a socket ticket. */
export async function resolveSessionById(sessionId, userId) {
  if (!mongoose.isValidObjectId(sessionId)) return null;
  const now = new Date();
  const session = await Session.findOne({ _id: sessionId, userId, revokedAt: null });
  if (!session || session.idleExpiresAt <= now || session.absoluteExpiresAt <= now) return null;
  const user = await User.findOne({ _id: session.userId, status: 'active' });
  return user ? { session, user } : null;
}

export async function revokeSession(userId, sessionId) {
  if (!mongoose.isValidObjectId(sessionId)) return false;
  const result = await Session.updateOne(
    { _id: sessionId, userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  if (result.modifiedCount !== 1) return false;
  await PushSubscription.deleteMany({ sessionId });
  endSessions([sessionId]);
  return true;
}

/** Revokes every active session of a user, optionally keeping one (the current device). */
export async function revokeAllSessions(userId, { exceptSessionId } = {}) {
  const filter = { userId, revokedAt: null };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  const ids = await Session.find(filter).distinct('_id');
  await Session.updateMany({ _id: { $in: ids } }, { $set: { revokedAt: new Date() } });
  // A signed-out device must not keep receiving notifications.
  await PushSubscription.deleteMany({ sessionId: { $in: ids } });
  endSessions(ids);
  return ids.length;
}

/** Active sessions for the security page, newest activity first. */
export async function listSessions(userId, currentSessionId) {
  const now = new Date();
  const sessions = await Session.find({
    userId,
    revokedAt: null,
    idleExpiresAt: { $gt: now },
    absoluteExpiresAt: { $gt: now },
  })
    .sort({ lastUsedAt: -1 })
    .limit(50);

  return sessions.map((session) => ({
    id: session.id,
    device: describeUserAgent(session.userAgent),
    ipPrefix: session.ipPrefix,
    createdAt: session.createdAt,
    lastUsedAt: session.lastUsedAt,
    current: session.id === String(currentSessionId),
  }));
}

/** True while a session can still be used (not revoked, not expired). */
export async function isSessionActive(sessionId) {
  const now = new Date();
  return Boolean(
    await Session.exists({
      _id: sessionId,
      revokedAt: null,
      idleExpiresAt: { $gt: now },
      absoluteExpiresAt: { $gt: now },
    }),
  );
}
