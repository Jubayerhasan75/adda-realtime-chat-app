// One-time cleanup for the switch to end-to-end encryption (docs/E2EE.md §8): deletes every
// chat, message and message photo/video from the DEVELOPMENT database (and its files from
// storage). Accounts, friendships and profile photos stay.
// Usage (from the project folder):
//   node --env-file=server/.env scripts/wipe-dev-messages.mjs --db=<database name> [--yes]
import mongoose from 'mongoose';
import { loadEnv } from '../server/src/config/env.js';
import { Attachment } from '../server/src/models/Attachment.js';
import { Conversation } from '../server/src/models/Conversation.js';
import { ConversationMember } from '../server/src/models/ConversationMember.js';
import { Message } from '../server/src/models/Message.js';
import { createStorage } from '../server/src/providers/storage/index.js';

const env = loadEnv();
await mongoose.connect(env.MONGODB_URI);
const dbName = mongoose.connection.name;

// Never in production, and only when the database's name is typed out on the command line.
if (env.NODE_ENV === 'production' || !process.argv.includes(`--db=${dbName}`)) {
  process.stdout.write(`Refusing: add --db=${dbName} to confirm (never runs in production).\n`);
  process.exit(1);
}

const counts = {
  conversations: await Conversation.countDocuments(),
  messages: await Message.countDocuments(),
  messageFiles: await Attachment.countDocuments({ purpose: 'message' }),
};
process.stdout.write(`Database "${dbName}": ${JSON.stringify(counts)}\n`);
if (!process.argv.includes('--yes')) {
  process.stdout.write('Dry run. Add --yes to delete.\n');
  process.exit(0);
}

const storage = createStorage(env);
let filesRemoved = 0;
for (const attachment of await Attachment.find({ purpose: 'message' })) {
  try {
    await storage?.remove({ key: attachment.storage.key, kind: attachment.kind });
    filesRemoved += 1;
  } catch (err) {
    process.stdout.write(`Could not delete one stored file: ${err.message}\n`);
  }
}
await Attachment.deleteMany({ purpose: 'message' });
await Message.deleteMany({});
await ConversationMember.deleteMany({});
await Conversation.deleteMany({});
process.stdout.write(`Deleted. Stored files removed: ${filesRemoved}.\n`);
await mongoose.disconnect();
