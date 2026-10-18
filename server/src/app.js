import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import {
  KLIPY_API_ORIGIN,
  KLIPY_MEDIA_ORIGIN,
  PERMISSIONS_POLICY,
  cspDirectives,
} from './config/contentSecurity.js';
import { createOriginCheck } from './config/origins.js';
import { loadSession, requireVerified } from './middleware/auth.js';
import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRateLimiters } from './middleware/rateLimits.js';
import { createMailer } from './providers/mailer.js';
import { createStorage } from './providers/storage/index.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createConversationsRouter } from './routes/conversations.routes.js';
import { createGroupsRouter } from './routes/groups.routes.js';
import { createDevMailboxRouter } from './routes/devMailbox.routes.js';
import { createMessagesRouter } from './routes/messages.routes.js';
import {
  createDirectoryRouter,
  createFriendsRouter,
  createNotificationsRouter,
} from './routes/friends.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { createKeysRouter } from './routes/keys.routes.js';
import { createAvatarRouter, createGifsRouter, createMediaRouter } from './routes/media.routes.js';
import { createPushRouter } from './routes/push.routes.js';
import { createTestSupportRouter } from './routes/testSupport.routes.js';
import { createSettingsRouter, createUsersRouter } from './routes/users.routes.js';
import { createAuthService } from './services/authService.js';
import { createConversationService } from './services/conversationService.js';
import { createDirectoryService } from './services/directoryService.js';
import { createFriendService } from './services/friendService.js';
import { createGroupService } from './services/groupService.js';
import { createKeyService } from './services/keyService.js';
import { createMediaService } from './services/mediaService.js';
import { onAuditRecorded } from './services/auditService.js';
import { notifySecurity, onNotificationCreated } from './services/notificationService.js';
import { createPresenceService } from './services/presenceService.js';
import { createPushService } from './services/pushService.js';
import { createSocketTickets } from './sockets/tickets.js';
import { createMessageService } from './services/messageService.js';
import { createUserService } from './services/userService.js';
import { sessionCookieConfig } from './utils/sessionCookie.js';

const DEFAULT_CLIENT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url));

/**
 * Builds the Express app without starting a server, so tests can use it directly.
 * @param {{ env: import('./config/env.js').Env, logger: import('pino').Logger, mailer?: import('./providers/mailer.js').Mailer, storage?: import('./providers/storage/index.js').Storage | null, pushSender?: Function }} deps
 */
export function createApp({
  env,
  logger,
  mailer = createMailer(env, logger),
  storage = createStorage(env),
  pushSender,
}) {
  const app = express();
  const sessionCookie = sessionCookieConfig(env);
  const limits = createRateLimiters();
  const media = createMediaService({ storage, logger });
  const presence = createPresenceService({ logger, offlineDelayMs: env.PRESENCE_OFFLINE_DELAY_MS });
  const push = createPushService({ env, logger, presence, send: pushSender });
  onNotificationCreated((event) =>
    push.friendEvent(event).catch((err) => logger.warn({ err }, 'Push failed')),
  );
  onAuditRecorded(notifySecurity);

  app.locals.env = env;
  app.locals.sessionCookie = sessionCookie;
  app.locals.mailer = mailer;
  app.locals.storage = storage;
  const conversations = createConversationService({ logger, media, push });
  app.locals.services = {
    auth: createAuthService({ env, mailer, logger }),
    users: createUserService({ logger, presence }),
    friends: createFriendService({ logger }),
    directory: createDirectoryService(),
    keys: createKeyService({ logger, mailer }),
    media,
    presence,
    push,
    socketTickets: createSocketTickets(),
    conversations,
    groups: createGroupService({ media, conversations }),
    messages: createMessageService({ logger, media }),
  };
  const isHttps = env.APP_ORIGIN.startsWith('https://');
  // Third-party hosts the page may talk to: media storage, and KLIPY when GIFs are enabled.
  const gifs = env.KLIPY_APP_KEY
    ? { api: [KLIPY_API_ORIGIN], media: [KLIPY_MEDIA_ORIGIN] }
    : { api: [], media: [] };
  const mediaHosts = [...(storage?.origins.media ?? []), ...gifs.media];
  const connectHosts = [...(storage?.origins.upload ?? []), ...gifs.api];

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(
    pinoHttp({
      logger,
      genReqId: () => randomUUID(),
      // Log only what is needed to debug: no headers, cookies, query strings or bodies.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, path: req.url.split('?')[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  );
  app.use((req, res, next) => {
    res.setHeader('X-Request-Id', req.id);
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: cspDirectives({ mediaHosts, connectHosts, isHttps }),
      },
      strictTransportSecurity: isHttps ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'same-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    next();
  });

  app.use('/api/health', healthRouter);

  // Everything below handles private, per-user data: never cache it anywhere.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', express.json({ limit: '32kb' }));
  app.use('/api', cookieParser());
  app.use('/api', loadSession(sessionCookie));
  app.use('/api', csrfProtection(createOriginCheck(env)));
  app.use('/api', limits.general);

  app.use('/api/auth', createAuthRouter(limits));
  app.use('/api/users/me/avatar', createAvatarRouter());
  app.use('/api/users', createUsersRouter(limits));
  app.use('/api/users', createDirectoryRouter(limits));
  app.use('/api/friends', createFriendsRouter(limits));
  app.use('/api/notifications', createPushRouter());
  app.use('/api/notifications', createNotificationsRouter());
  app.use('/api/conversations', createConversationsRouter(limits));
  app.use('/api/groups', createGroupsRouter(limits));
  app.use('/api/messages', createMessagesRouter(limits));
  app.use('/api/media', createMediaRouter(limits, { localStorage: storage?.name === 'local' }));
  app.use('/api/gifs', createGifsRouter());
  app.use('/api/keys', createKeysRouter(limits));
  app.post('/api/realtime/ticket', requireVerified, (req, res) => {
    res.json({
      data: app.locals.services.socketTickets.issue(req.auth.user._id, req.auth.session._id),
    });
  });
  app.use('/api/settings', createSettingsRouter());
  if (env.NODE_ENV === 'test') app.use('/api/test', createTestSupportRouter());
  if (env.NODE_ENV === 'development' && env.MAIL_TRANSPORT === 'console') {
    app.use('/api/dev', createDevMailboxRouter());
  }
  app.use('/api', notFoundHandler);

  serveClient(app, env.CLIENT_DIST_DIR ?? DEFAULT_CLIENT_DIST, logger);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/**
 * Serves the built React app (single-origin deployment, see docs/ARCHITECTURE.md §2).
 * Hashed assets are cached for a year; index.html is always revalidated so updates appear.
 */
function serveClient(app, distDir, logger) {
  const indexFile = path.join(distDir, 'index.html');
  if (!existsSync(indexFile)) {
    logger.info({ distDir }, 'Client build not found; serving API only');
    return;
  }

  app.use(
    '/assets',
    express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y', index: false }),
  );
  app.use(express.static(distDir, { index: false, maxAge: 0 }));

  app.use((req, res, next) => {
    const isPageRequest =
      (req.method === 'GET' || req.method === 'HEAD') &&
      !req.path.startsWith('/socket.io/') &&
      req.accepts('html');
    if (!isPageRequest) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexFile);
  });
}
