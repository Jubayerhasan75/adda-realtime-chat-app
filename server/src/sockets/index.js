import { parse as parseCookies } from 'cookie';
import { Server } from 'socket.io';
import { SOCKET_ERRORS } from '@chat/shared';
import { createOriginCheck } from '../config/origins.js';
import { attachRealtime, sessionRoom, userRoom } from '../services/realtime.js';
import { isSessionActive, resolveSession, resolveSessionById } from '../services/sessionService.js';
import { registerMessagingHandlers } from './messaging.js';

const SESSION_RECHECK_MS = 5 * 60 * 1000;

/**
 * Blocks cross-site WebSocket hijacking: a browser always sends Origin on WebSocket upgrades and
 * on cross-site requests. A same-origin polling GET may omit it, in which case the browser's
 * Sec-Fetch-Site header must say "same-origin". Anything else (other sites, unknown clients)
 * is refused before the handshake.
 */
export function isAllowedSocketRequest(headers, allowedOrigin) {
  const isAllowed =
    typeof allowedOrigin === 'function' ? allowedOrigin : (origin) => origin === allowedOrigin;
  if (headers.origin) return isAllowed(headers.origin);
  return headers['sec-fetch-site'] === 'same-origin';
}

/**
 * Attaches Socket.IO to the HTTP server (docs/ARCHITECTURE.md §5).
 * @param {import('node:http').Server} httpServer
 * @param {{ env: import('../config/env.js').Env, logger: import('pino').Logger, sessionCookie: { name: string }, services: { conversations: object } }} deps
 */
export function attachSocketServer(httpServer, { env, logger, sessionCookie, services }) {
  const isAllowedOrigin = createOriginCheck(env);
  const io = new Server(httpServer, {
    // The app may live on another site (Vercel) than this server (Render): allow only our app.
    cors: { origin: (origin, callback) => callback(null, isAllowedOrigin(origin)) },
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    allowRequest: (req, callback) =>
      callback(null, isAllowedSocketRequest(req.headers, isAllowedOrigin)),
  });

  // Authenticate the handshake with the same HttpOnly session cookie the REST API uses.
  io.use(async (socket, next) => {
    try {
      // Same site: the session cookie. App on another site: a one-time ticket from the API.
      const cookies = parseCookies(socket.request.headers.cookie ?? '');
      let auth = await resolveSession(cookies[sessionCookie.name]);
      if (!auth && socket.handshake.auth?.ticket) {
        const ticket = services.socketTickets?.redeem(socket.handshake.auth.ticket);
        if (ticket) auth = await resolveSessionById(ticket.sessionId, ticket.userId);
      }
      if (!auth) {
        next(new Error(SOCKET_ERRORS.UNAUTHENTICATED));
        return;
      }
      if (!auth.user.emailVerifiedAt) {
        next(new Error(SOCKET_ERRORS.EMAIL_NOT_VERIFIED));
        return;
      }
      socket.data.userId = String(auth.user._id);
      socket.data.sessionId = String(auth.session._id);
      next();
    } catch (err) {
      logger.error({ err }, 'Socket authentication failed');
      next(new Error('SERVER_ERROR'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, sessionId } = socket.data;
    // The only rooms a socket is ever in; there is no client event to join others.
    socket.join([userRoom(userId), sessionRoom(sessionId)]);
    registerMessagingHandlers(socket, {
      conversations: services.conversations,
      presence: services.presence,
      logger,
    });
    // The app says whether it's on screen when it connects (background tabs aren't "online").
    services.presence
      .connected(userId, socket.id, socket.handshake.auth?.visible !== false)
      .catch((err) => logger.warn({ err }, 'Presence connect failed'));

    // Sessions can also end by expiring; re-check periodically and drop stale connections.
    const recheck = setInterval(async () => {
      if (!(await isSessionActive(sessionId).catch(() => true))) socket.disconnect(true);
    }, SESSION_RECHECK_MS);
    recheck.unref();
    socket.on('disconnect', () => {
      clearInterval(recheck);
      services.presence
        .disconnected(userId, socket.id)
        .catch((err) => logger.warn({ err }, 'Presence disconnect failed'));
    });
  });

  attachRealtime(io);
  return io;
}
