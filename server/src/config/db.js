import mongoose from 'mongoose';

// Drop filter fields that are not in the schema. NoSQL-injection protection lives at the input
// boundary instead: every request is parsed by a strict Zod schema that only lets primitives
// through, so user input can never smuggle `$` operators into a query. (Mongoose's global
// `sanitizeFilter` is not used because it also strips the server's own operators.)
mongoose.set('strictQuery', true);

/**
 * @param {string} uri
 * @param {import('pino').Logger} logger
 */
export async function connectDatabase(uri, logger) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  logger.info({ database: mongoose.connection.name }, 'MongoDB connected');

  await migrateIndexes(logger);
  // Unique indexes enforce rules such as "one account per username"; Mongoose builds them in
  // the background, so wait until they exist before serving any request.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
}

/**
 * Index changes that Mongoose can't apply by itself (it refuses to replace an index whose
 * options changed). Each step is safe to run on every start.
 */
async function migrateIndexes(logger) {
  // Groups have no `directKey`: the "one direct chat per pair" index must ignore them
  // (docs/GROUPS.md §2).
  const conversations = mongoose.connection.db.collection('conversations');
  const indexes = await conversations.indexes().catch(() => []); // no collection yet
  const old = indexes.find((index) => index.name === 'directKey_1');
  if (old && !old.partialFilterExpression) {
    await conversations.dropIndex('directKey_1');
    logger.info('Replaced the directKey index so group chats can be stored');
  }
}

export async function pingDatabase() {
  if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected) {
    throw new Error('Database is not connected');
  }
  await mongoose.connection.db.admin().ping();
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
