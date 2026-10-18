// Starts the real server (serving the production client build) against a throwaway
// MongoDB replica set, so E2E tests never touch the development database.
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { TEST_MONGOD_ARGS } from '../server/tests/helpers/testDatabase.js';

const port = process.env.E2E_PORT ?? '4100';

// Playwright stops this process without a signal handler running on Windows, so the
// database folder can't be cleaned up on exit. Keep it in one fixed, git-ignored place inside
// the project and wipe it at every start instead of leaking folders into the system temp dir.
const dbPath = fileURLToPath(new URL('./.db', import.meta.url));
rmSync(dbPath, { recursive: true, force: true });
mkdirSync(dbPath, { recursive: true });
// Uploaded photos/videos: the local development storage, wiped at every start as well.
const mediaPath = fileURLToPath(new URL('./.media', import.meta.url));
rmSync(mediaPath, { recursive: true, force: true });

const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
  // A slow disk or a busy machine can take longer than the 10 s default to start mongod.
  instanceOpts: [{ args: TEST_MONGOD_ARGS, dbPath, launchTimeout: 60_000 }],
});

Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: port,
  MONGODB_URI: replSet.getUri('chat_e2e'),
  APP_ORIGIN: `http://localhost:${port}`,
  LOG_LEVEL: 'warn',
  // Lets tests simulate distinct clients via X-Forwarded-For (see e2e/helpers.js).
  TRUST_PROXY_HOPS: '1',
  // Friends see "offline" after 1 s instead of 8 s, to keep the tests fast.
  PRESENCE_OFFLINE_DELAY_MS: '1000',
  // Never the real Cloudinary or KLIPY accounts: files stay in e2e/.media, and the tests
  // answer KLIPY requests themselves (see e2e/media.spec.js).
  MEDIA_STORAGE: 'local',
  LOCAL_MEDIA_DIR: mediaPath,
  KLIPY_APP_KEY: 'e2e-fake-klipy-key',
});
delete process.env.CLOUDINARY_URL;

const stopDatabase = () => replSet.stop().finally(() => process.exit(0));
process.once('SIGINT', stopDatabase);
process.once('SIGTERM', stopDatabase);

await import('../server/src/server.js');
