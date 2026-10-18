import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDatabase, disconnectDatabase } from '../../src/config/db.js';

/**
 * Throwaway test databases don't need WiredTiger's 200 MB of preallocated log files; without
 * this every test database (and every one left behind by a killed run) costs 200 MB of disk.
 */
export const TEST_MONGOD_ARGS = [
  '--wiredTigerEngineConfigString=log=(prealloc=false,file_max=10MB)',
];

/**
 * Starts a real single-node MongoDB replica set (transactions work) and connects Mongoose.
 * The first run downloads a mongod binary, which can take a minute.
 * @param {import('pino').Logger} logger
 */
export async function startTestDatabase(logger) {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ args: TEST_MONGOD_ARGS }],
  });
  await connectDatabase(replSet.getUri('chat_test'), logger);

  return {
    uri: replSet.getUri('chat_test'),
    async stop() {
      await disconnectDatabase();
      await replSet.stop({ doCleanup: true, force: true });
    },
  };
}
