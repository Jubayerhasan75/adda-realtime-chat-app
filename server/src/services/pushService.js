import webpush from 'web-push';
import { Conversation } from '../models/Conversation.js';
import { ConversationMember } from '../models/ConversationMember.js';
import { PushSubscription } from '../models/PushSubscription.js';
import { User } from '../models/User.js';
import { friendNotification, messageNotification } from './notificationRules.js';
import { isSessionActive } from './sessionService.js';

const MAX_FAILURES = 5;
const TTL_SECONDS = 24 * 60 * 60;

const hostOf = (endpoint) => {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return 'invalid';
  }
};

/**
 * Web Push (docs/ARCHITECTURE.md §11): subscriptions per login session, sending with the VAPID
 * keys, and cleanup of dead subscriptions. `send` is web-push's sender; tests pass a fake.
 * @param {{ env: import('../config/env.js').Env, logger: import('pino').Logger,
 *   presence?: { isOnline: (userId: string) => boolean },
 *   send?: (subscription: object, payload: string, options: object) => Promise<unknown> }} deps
 */
export function createPushService({ env, logger, presence, send }) {
  const configured = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  const subject =
    env.VAPID_SUBJECT ??
    (env.APP_ORIGIN.startsWith('https://') ? env.APP_ORIGIN : 'mailto:push@localhost.localdomain');
  const deliver =
    send ??
    ((subscription, payload, options) =>
      webpush.sendNotification(subscription, payload, {
        ...options,
        vapidDetails: {
          subject,
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
        },
      }));

  /** Sends one notification to every signed-in device of a user that subscribed. */
  async function sendToUser(userId, notification) {
    if (!configured || !notification) return 0;
    const subscriptions = await PushSubscription.find({ userId });
    let sent = 0;
    for (const subscription of subscriptions) {
      // Signed out (expired, revoked): never deliver to that device again.
      if (!(await isSessionActive(subscription.sessionId))) {
        await PushSubscription.deleteOne({ _id: subscription._id });
        continue;
      }
      try {
        await deliver(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys.toObject?.() ?? subscription.keys,
          },
          JSON.stringify(notification),
          { TTL: TTL_SECONDS, urgency: 'high' },
        );
        sent += 1;
        await PushSubscription.updateOne(
          { _id: subscription._id },
          { $set: { lastSuccessAt: new Date(), failureCount: 0 } },
        );
      } catch (err) {
        const gone = err.statusCode === 404 || err.statusCode === 410;
        if (gone || subscription.failureCount + 1 >= MAX_FAILURES) {
          await PushSubscription.deleteOne({ _id: subscription._id });
        } else {
          await PushSubscription.updateOne(
            { _id: subscription._id },
            { $inc: { failureCount: 1 } },
          );
        }
        // Only the push service host is logged; the endpoint itself is a per-device secret.
        logger.warn(
          { status: err.statusCode, host: hostOf(subscription.endpoint), removed: gone },
          'Push delivery failed',
        );
      }
    }
    return sent;
  }

  return {
    configured,
    publicKey: configured ? env.VAPID_PUBLIC_KEY : null,

    /** Saves this device's subscription for the current login session (re-binds if it moved). */
    async subscribe(me, sessionId, { endpoint, keys }, userAgent = '') {
      await PushSubscription.findOneAndUpdate(
        { endpoint },
        {
          $set: {
            userId: me._id,
            sessionId,
            keys,
            userAgent: String(userAgent).slice(0, 300),
            failureCount: 0,
          },
        },
        { upsert: true },
      );
    },

    async unsubscribe(me, endpoint) {
      await PushSubscription.deleteOne({ endpoint, userId: me._id });
    },

    sendToUser,

    /** A message was stored: notify the other member if the rules allow it. */
    async messageSent({ message, sender, recipientId }) {
      if (!configured) return;
      const [recipient, member, conversation] = await Promise.all([
        User.findOne({ _id: recipientId, status: 'active' }).select('settings'),
        ConversationMember.findOne({ conversationId: message.conversationId, userId: recipientId }),
        Conversation.findById(message.conversationId).select('type name'),
      ]);
      if (!recipient || !member) return;
      await sendToUser(
        recipientId,
        messageNotification({
          recipient,
          sender,
          message,
          mutedUntil: member.mutedUntil,
          appOnScreen: presence?.isOnline(String(recipientId)) ?? false,
          now: new Date(),
          group: conversation?.type === 'group' ? { name: conversation.name } : null,
        }),
      );
    },

    /** Friend request / accepted. */
    async friendEvent({ userId, type, actor }) {
      if (!configured) return;
      const recipient = await User.findOne({ _id: userId, status: 'active' }).select('settings');
      if (!recipient) return;
      await sendToUser(userId, friendNotification({ recipient, actor, type }));
    },
  };
}
