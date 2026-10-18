import { z } from 'zod';
import { currentPasswordField } from './fields.js';

// docs/E2EE.md §2. The server only ever stores public keys and the passphrase-locked backup.

const base64url = (min, max) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, 'Invalid encoding')
    .min(min)
    .max(max);

export const keyIdField = base64url(22, 22);

/** A P-256 public key in SPKI form (91 bytes → 122 base64url characters). */
export const publicKeyField = base64url(120, 124);

/** The keyring encrypted with the recovery passphrase (Argon2id + AES-256-GCM). */
export const keyBackupSchema = z.strictObject({
  v: z.literal(1),
  kdf: z.strictObject({
    alg: z.literal('argon2id'),
    // Never weaker than the app's defaults, so a weak backup can't be stored.
    memoryKiB: z.number().int().min(65536).max(1048576),
    passes: z.number().int().min(3).max(20),
    parallelism: z.number().int().min(1).max(8),
    salt: base64url(22, 22),
  }),
  iv: base64url(16, 16),
  ct: base64url(40, 200_000),
});

/** First key: creates my identity (only when I have none). */
export const setupKeysSchema = z.strictObject({
  keyId: keyIdField,
  publicKey: publicKeyField,
  backup: keyBackupSchema,
});

/** New key pair (forgot passphrase, or rotation): needs my account password. */
export const rotateKeysSchema = setupKeysSchema.extend({ password: currentPasswordField });

/** New passphrase for the same keys: needs my account password. */
export const replaceBackupSchema = z.strictObject({
  backup: keyBackupSchema,
  password: currentPasswordField,
});

/** The encrypted message as stored by the server (docs/E2EE.md §3). */
export const envelopeSchema = z.strictObject({
  v: z.literal(1),
  sk: keyIdField,
  rk: keyIdField,
  iv: base64url(16, 16),
  ct: base64url(22, 24_000),
});
