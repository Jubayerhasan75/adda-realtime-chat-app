import { SERVER_EVENTS } from '@chat/shared';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { emitToUser } from './realtime.js';
import { toPublicUser } from './userService.js';

const FEED_LIMIT = 50;

// Push notifications for new feed entries (set by app.js; nothing happens without it).
let pushHook = null;
export function onNotificationCreated(hook) {
  pushHook = hook;
}

function serialize(notification, actor) {
  return {
    id: String(notification._id),
    type: notification.type,
    actor: actor ? toPublicUser(actor) : null,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
  };
}

/** Creates a feed entry and pushes it to the recipient's open devices. */
export async function notify({ userId, type, actor, friendshipId }, options = {}) {
  const [notification] = await Notification.create(
    [{ userId, type, actorId: actor._id, friendshipId }],
    options,
  );
  return () => {
    emitToUser(userId, SERVER_EVENTS.NOTIFICATION_NEW, serialize(notification, actor));
    pushHook?.({ userId, type, actor });
  };
}

/** Removes notifications that no longer make sense (e.g. a request that was cancelled). */
export function removeFriendRequestNotifications(friendshipId, options = {}) {
  return Notification.deleteMany({ friendshipId, type: 'friend_request' }, options);
}

export async function listNotifications(userId) {
  const notifications = await Notification.find({ userId })
    .sort({ createdAt: -1 })
    .limit(FEED_LIMIT);
  const actors = await User.find({
    _id: { $in: notifications.map((n) => n.actorId) },
    status: 'active',
  });
  const actorById = new Map(actors.map((actor) => [String(actor._id), actor]));
  return {
    items: notifications
      .map((n) => serialize(n, actorById.get(String(n.actorId))))
      .filter((item) => item.actor),
    unreadCount: await Notification.countDocuments({ userId, readAt: null }),
  };
}

/** Marks some or all of the user's own notifications as read (others' ids are ignored). */
export async function markNotificationsRead(userId, { ids, all }) {
  const filter = { userId, readAt: null };
  if (!all) filter._id = { $in: ids };
  await Notification.updateMany(filter, { $set: { readAt: new Date() } });
}
