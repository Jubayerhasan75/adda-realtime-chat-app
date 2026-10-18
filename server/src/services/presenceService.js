import { SERVER_EVENTS } from '@chat/shared';
import { Friendship } from '../models/Friendship.js';
import { User } from '../models/User.js';
import { emitToUser } from './realtime.js';

/**
 * What `viewer` may see of `subject` (docs/ARCHITECTURE.md §8). Friends only, and reciprocal
 * like read receipts: if I hide my online status (or last seen), I can't see anyone else's.
 * Hidden values are `null`.
 */
export function presenceView(subject, viewer, online) {
  const theirs = subject.settings?.privacy ?? {};
  const mine = viewer.settings?.privacy ?? {};
  const showOnline = theirs.onlineStatus === 'friends' && mine.onlineStatus === 'friends';
  const showLastSeen = theirs.lastSeen === 'friends' && mine.lastSeen === 'friends';
  const userId = String(subject._id);
  // Someone who is online but hides it must not appear with a misleading old "last seen".
  if (online && !showOnline) return { userId, online: null, lastSeenAt: null };
  return {
    userId,
    online: showOnline ? online : null,
    lastSeenAt: showLastSeen && !online ? (subject.lastSeenAt ?? null) : null,
  };
}

async function friendsOf(userId) {
  const friendships = await Friendship.find({ userIds: userId, status: 'accepted' }).select(
    'userIds',
  );
  const ids = friendships.flatMap((f) => f.userIds).filter((id) => String(id) !== String(userId));
  if (ids.length === 0) return [];
  return User.find({ _id: { $in: ids }, status: 'active' }).select('settings lastSeenAt');
}

/**
 * Who is online (docs/ARCHITECTURE.md §8). Kept in memory for the single v1 instance:
 * userId → (socketId → visible). Online = at least one connected device with the app on
 * screen. Going offline waits a few seconds so a quick reconnect or tab switch doesn't flicker,
 * then saves "last seen".
 * @param {{ logger: import('pino').Logger, offlineDelayMs?: number }} deps
 */
export function createPresenceService({ logger, offlineDelayMs = 8000 }) {
  const devices = new Map();
  const offlineTimers = new Map();

  const isOnline = (userId) => [...(devices.get(String(userId))?.values() ?? [])].some(Boolean);

  /** Tells each friend what they may see of this user now. */
  async function broadcast(userId) {
    const subject = await User.findOne({ _id: userId, status: 'active' }).select(
      'settings lastSeenAt',
    );
    if (!subject) return;
    const online = isOnline(userId);
    for (const friend of await friendsOf(userId)) {
      emitToUser(friend._id, SERVER_EVENTS.PRESENCE_UPDATE, presenceView(subject, friend, online));
    }
  }

  /** Sends a user the full picture of their friends' presence (replaces what they had). */
  async function sendSnapshot(userId) {
    const me = await User.findById(userId).select('settings');
    if (!me) return;
    const friends = await friendsOf(userId);
    emitToUser(userId, SERVER_EVENTS.PRESENCE_SNAPSHOT, {
      users: friends.map((friend) => presenceView(friend, me, isOnline(friend._id))),
    });
  }

  function scheduleOffline(userId) {
    if (offlineTimers.has(userId)) return;
    const timer = setTimeout(async () => {
      offlineTimers.delete(userId);
      if (isOnline(userId)) return;
      try {
        await User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } });
        await broadcast(userId);
      } catch (err) {
        logger.warn({ err }, 'Presence update failed');
      }
    }, offlineDelayMs);
    timer.unref?.();
    offlineTimers.set(userId, timer);
  }

  /** Applies a change and announces "online" right away, or "offline" after the delay. */
  async function change(userId, update) {
    const wasOnline = isOnline(userId);
    update();
    const nowOnline = isOnline(userId);
    if (nowOnline) {
      if (offlineTimers.has(userId)) {
        // Back before "offline" was announced: friends never saw a change, so say nothing.
        clearTimeout(offlineTimers.get(userId));
        offlineTimers.delete(userId);
        return;
      }
      if (!wasOnline) await broadcast(userId);
    } else if (wasOnline) {
      scheduleOffline(userId);
    }
  }

  const sockets = (userId) => {
    if (!devices.has(userId)) devices.set(userId, new Map());
    return devices.get(userId);
  };

  return {
    isOnline,
    presenceOf: async (viewer, subjectId) => {
      const subject = await User.findById(subjectId).select('settings lastSeenAt');
      return subject ? presenceView(subject, viewer, isOnline(subjectId)) : null;
    },

    async connected(userId, socketId, visible = true) {
      await change(userId, () => sockets(userId).set(socketId, visible));
      await sendSnapshot(userId);
    },

    async setVisible(userId, socketId, visible) {
      if (!devices.get(userId)?.has(socketId)) return;
      await change(userId, () => devices.get(userId).set(socketId, visible));
    },

    async disconnected(userId, socketId) {
      await change(userId, () => {
        devices.get(userId)?.delete(socketId);
        if (devices.get(userId)?.size === 0) devices.delete(userId);
      });
    },

    sendSnapshot,

    /** My privacy settings changed: friends see the new picture, and so do I (reciprocity). */
    async settingsChanged(userId) {
      await broadcast(userId);
      await sendSnapshot(userId);
    },
  };
}
