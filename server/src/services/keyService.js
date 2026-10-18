import mongoose from 'mongoose';
import { ERROR_CODES, SERVER_EVENTS } from '@chat/shared';
import { ConversationMember } from '../models/ConversationMember.js';
import { Friendship } from '../models/Friendship.js';
import { IdentityKey } from '../models/IdentityKey.js';
import { KeyBackup } from '../models/KeyBackup.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { verifyPassword } from '../utils/passwords.js';
import { recordAudit } from './auditService.js';
import { encryptionResetNotice } from './emailTemplates.js';
import { emitToUser } from './realtime.js';
import { blockStatus } from './relationshipService.js';

const DUPLICATE_KEY = 11000;

const keyView = (key) => ({
  keyId: key.keyId,
  publicKey: key.publicKey,
  createdAt: key.createdAt,
});

async function requirePassword(user, password) {
  const withHash = await User.findById(user._id).select('+passwordHash');
  if (!(await verifyPassword(withHash.passwordHash, password))) {
    throw new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'Incorrect password', [
      { path: 'password', issue: 'Incorrect password' },
    ]);
  }
}

/** Ids of everyone who shares at least one group with `userId`. */
async function groupMatesOf(userId) {
  const mine = await ConversationMember.find({ userId, peerId: null }).select('conversationId');
  if (mine.length === 0) return [];
  const mates = await ConversationMember.find({
    conversationId: { $in: mine.map((m) => m.conversationId) },
    userId: { $ne: userId },
  }).select('userId');
  return mates.map((m) => m.userId);
}

/** Friends and group members must refetch my keys (and will see "security code changed"). */
async function announceNewKey(userId) {
  const friendships = await Friendship.find({ userIds: userId, status: 'accepted' }).select(
    'userIds',
  );
  const recipients = new Set([
    ...friendships.flatMap((friendship) => friendship.userIds.map(String)),
    ...(await groupMatesOf(userId)).map(String),
  ]);
  for (const id of recipients) {
    emitToUser(id, SERVER_EVENTS.KEYS_UPDATED, { userId: String(userId) });
  }
}

/**
 * End-to-end encryption keys (docs/E2EE.md §2): public keys and the locked backup.
 * Changing keys after setup requires the account password and emails a warning, because a
 * stolen session that could swap keys could make friends encrypt to an attacker.
 * @param {{ logger: import('pino').Logger, mailer: import('../providers/mailer.js').Mailer }} deps
 */
export function createKeyService({ logger, mailer }) {
  async function addKey(user, { keyId, publicKey, backup }) {
    try {
      await mongoose.connection.transaction(async (session) => {
        await IdentityKey.create([{ userId: user._id, keyId, publicKey }], { session });
        await KeyBackup.updateOne(
          { userId: user._id },
          { $set: { backup } },
          { upsert: true, session },
        );
      });
    } catch (err) {
      if (err.code !== DUPLICATE_KEY) throw err;
      throw new AppError(409, ERROR_CODES.INVALID_STATE, 'This key is already registered');
    }
    await announceNewKey(user._id);
  }

  return {
    /** My keys and my locked backup (to restore on a new device). */
    async mine(user) {
      const [keys, backup] = await Promise.all([
        IdentityKey.find({ userId: user._id }).sort({ createdAt: -1 }),
        KeyBackup.findOne({ userId: user._id }),
      ]);
      return {
        currentKeyId: keys[0]?.keyId ?? null,
        keys: keys.map(keyView),
        backup: backup?.backup ?? null,
      };
    },

    /** First-time setup: only when I have no key yet. */
    async setup(user, input) {
      if (await IdentityKey.exists({ userId: user._id })) {
        throw new AppError(409, ERROR_CODES.INVALID_STATE, 'Encryption is already set up');
      }
      await addKey(user, input);
      return this.mine(user);
    },

    /** A new key pair (e.g. forgotten passphrase). Needs the password; emails a warning. */
    async rotate(user, { password, ...input }, client) {
      await requirePassword(user, password);
      await addKey(user, input);
      await recordAudit(logger, 'encryption_reset', { userId: user._id, ...client });
      await mailer
        .send({ to: user.email, ...encryptionResetNotice({ displayName: user.displayName }) })
        .catch((err) => logger.warn({ err }, 'Encryption reset email failed'));
      return this.mine(user);
    },

    /** New passphrase for the same keys. Needs the password. */
    async replaceBackup(user, { password, backup }) {
      await requirePassword(user, password);
      if (!(await IdentityKey.exists({ userId: user._id }))) {
        throw new AppError(409, ERROR_CODES.INVALID_STATE, 'Set up encryption first');
      }
      await KeyBackup.updateOne({ userId: user._id }, { $set: { backup } });
    },

    /**
     * Someone's public keys, newest first (public by nature, but only for signed-in users who
     * haven't blocked each other). Old keys are included so old messages stay readable.
     */
    async publicKeysOf(me, userId) {
      if (!mongoose.isValidObjectId(userId))
        throw new AppError(404, ERROR_CODES.NOT_FOUND, 'User not found');
      const { iBlocked, blockedMe } = await blockStatus(me._id, userId);
      // People in the same group always need each other's keys (to share the group key).
      if (
        (iBlocked || blockedMe) &&
        !(await groupMatesOf(me._id)).some((id) => id.equals(userId))
      ) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, 'User not found');
      }
      const keys = await IdentityKey.find({ userId }).sort({ createdAt: -1 });
      return { currentKeyId: keys[0]?.keyId ?? null, keys: keys.map(keyView) };
    },
  };
}
