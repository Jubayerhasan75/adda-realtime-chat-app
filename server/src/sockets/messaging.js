import {
  CLIENT_EVENTS,
  ERROR_CODES,
  presenceRefreshSchema,
  presenceVisibilitySchema,
  receiptSchema,
  sendMessageSchema,
  typingSchema,
} from '@chat/shared';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

/** Fixed-window counters per event for one socket (docs/API.md §4). */
function createSocketRateLimiter() {
  const windows = new Map();
  return (event, { count, windowMs }) => {
    const now = Date.now();
    const current = windows.get(event);
    if (!current || now - current.start >= windowMs) {
      windows.set(event, { start: now, used: 1 });
      return true;
    }
    current.used += 1;
    return current.used <= count;
  };
}

const LIMITS = {
  send: { count: 30, windowMs: 10_000 },
  receipt: { count: 60, windowMs: 10_000 },
  typing: { count: 10, windowMs: 10_000 },
  presence: { count: 20, windowMs: 10_000 },
};

const fail = (code, message) => ({ ok: false, error: { code, message } });

/**
 * Client → server messaging events (docs/API.md §3.1). Every event is validated with the shared
 * Zod schema, rate-limited, run as the authenticated user (never a user id from the payload),
 * and answered through the Socket.IO acknowledgement as `{ ok, data }` or `{ ok, error }`.
 * @param {import('socket.io').Socket} socket
 * @param {{ conversations: ReturnType<import('../services/conversationService.js').createConversationService>, logger: import('pino').Logger }} deps
 */
export function registerMessagingHandlers(socket, { conversations, presence, logger }) {
  const allow = createSocketRateLimiter();
  const typingIn = new Set();

  const on = (event, schema, limit, handler) => {
    socket.on(event, async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!allow(event, limit)) {
        reply(fail(ERROR_CODES.RATE_LIMITED, 'You’re sending too fast. Please slow down.'));
        return;
      }
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        reply(fail(ERROR_CODES.VALIDATION_FAILED, parsed.error.issues[0].message));
        return;
      }
      try {
        const me = await User.findOne({ _id: socket.data.userId, status: 'active' });
        if (!me) {
          reply(fail(ERROR_CODES.UNAUTHENTICATED, 'Please log in again'));
          return;
        }
        reply({ ok: true, data: await handler(me, parsed.data) });
      } catch (err) {
        if (err instanceof AppError) {
          reply(fail(err.code, err.message));
          return;
        }
        logger.error({ err, event }, 'Socket event failed');
        reply(fail(ERROR_CODES.INTERNAL_ERROR, 'Something went wrong'));
      }
    });
  };

  on(CLIENT_EVENTS.MESSAGE_SEND, sendMessageSchema, LIMITS.send, async (me, data) => {
    typingIn.delete(data.conversationId);
    const { message } = await conversations.sendMessage(me, data);
    return { message };
  });

  on(CLIENT_EVENTS.MESSAGE_DELIVERED, receiptSchema, LIMITS.receipt, (me, data) =>
    conversations.markDelivered(me, data.conversationId, data.upToSeq),
  );

  on(CLIENT_EVENTS.CONVERSATION_READ, receiptSchema, LIMITS.receipt, (me, data) =>
    conversations.markRead(me, data.conversationId, data.upToSeq),
  );

  on(CLIENT_EVENTS.TYPING_START, typingSchema, LIMITS.typing, async (me, { conversationId }) => {
    await conversations.setTyping(me, conversationId, true);
    typingIn.add(conversationId);
    return null;
  });

  on(CLIENT_EVENTS.TYPING_STOP, typingSchema, LIMITS.typing, async (me, { conversationId }) => {
    typingIn.delete(conversationId);
    await conversations.setTyping(me, conversationId, false);
    return null;
  });

  on(
    CLIENT_EVENTS.PRESENCE_VISIBILITY,
    presenceVisibilitySchema,
    LIMITS.presence,
    async (me, data) => {
      await presence?.setVisible(String(me._id), socket.id, data.visible);
      return null;
    },
  );

  on(CLIENT_EVENTS.PRESENCE_REFRESH, presenceRefreshSchema, LIMITS.presence, async (me) => {
    await presence?.sendSnapshot(String(me._id));
    return null;
  });

  // A dropped connection must never leave "typing…" showing on the other side.
  socket.on('disconnect', async () => {
    if (typingIn.size === 0) return;
    const me = await User.findById(socket.data.userId).catch(() => null);
    if (!me) return;
    await Promise.all(
      [...typingIn].map((id) => conversations.setTyping(me, id, false).catch(() => {})),
    );
  });
}
