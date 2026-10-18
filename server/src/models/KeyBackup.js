import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A person's private keys, locked with their recovery passphrase on their own device
 * (Argon2id + AES-256-GCM, docs/E2EE.md §2). The server stores it but can't open it.
 */
const keyBackupSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    backup: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

export const KeyBackup = mongoose.model('KeyBackup', keyBackupSchema);
