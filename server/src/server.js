import http from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './config/logger.js';
import { attachSocketServer } from './sockets/index.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;
const MEDIA_CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

let env;
try {
  env = loadEnv();
} catch (err) {
  console.error(err.message);
  console.error('Copy server/.env.example to server/.env and fill in the values.');
  process.exit(1);
}

const logger = createLogger(env);

async function start() {
  await connectDatabase(env.MONGODB_URI, logger);

  const app = createApp({ env, logger });
  await checkMailer(app.locals.mailer);
  const cleanupTimer = startMediaCleanup(app);
  const server = http.createServer(app);
  const io = attachSocketServer(server, {
    env,
    logger,
    sessionCookie: app.locals.sessionCookie,
    services: app.locals.services,
  });

  server.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, env: env.NODE_ENV },
      env.NODE_ENV === 'production'
        ? `Server listening on port ${env.PORT} for ${env.APP_ORIGIN}`
        : `Server listening on http://localhost:${env.PORT}`,
    );
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down');
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    clearInterval(cleanupTimer);
    io.close();
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

/** Reports a wrong SMTP login at start-up instead of silently failing every sign-up email. */
async function checkMailer(mailer) {
  if (!mailer.verify) {
    logger.info(
      'Email is not sent in development: open http://localhost:5173/dev/mailbox to read it',
    );
    return;
  }
  try {
    await mailer.verify();
    logger.info('SMTP login OK: emails will be delivered');
  } catch (err) {
    logger.error(
      { code: err.code, response: err.response },
      'SMTP login FAILED: emails cannot be sent. Check SMTP_HOST/PORT/USER/PASS in server/.env (docs/SETUP.md step 4)',
    );
  }
}

/**
 * Deletes unsent uploads older than a day and retries failed storage deletes
 * (docs/ARCHITECTURE.md §9 step 7).
 */
function startMediaCleanup(app) {
  const { env, services } = app.locals;
  const where = { cloudinary: 'Cloudinary', local: 'this computer (development only)', none: null }[
    env.MEDIA_STORAGE
  ];
  if (!where) {
    logger.warn(
      'Photo/video uploads are OFF: set CLOUDINARY_URL in server/.env (docs/SETUP.md step 5)',
    );
    return null;
  }
  logger.info(`Photos and videos are stored on ${where}`);
  if (!env.KLIPY_APP_KEY) logger.info('GIFs are OFF: set KLIPY_APP_KEY to enable them (optional)');

  const run = () =>
    services.media
      .cleanup()
      .then((removed) => removed && logger.info({ removed }, 'Media cleanup'))
      .catch((err) => logger.warn({ err }, 'Media cleanup failed'));
  run();
  return setInterval(run, MEDIA_CLEANUP_INTERVAL_MS).unref();
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
