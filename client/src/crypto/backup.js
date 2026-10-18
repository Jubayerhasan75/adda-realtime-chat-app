import { argon2id } from 'hash-wasm';
import { base64UrlToBytes, bytesToBase64Url, fromUtf8, randomBytes, utf8 } from './encoding.js';

// docs/E2EE.md §2 — the keyring backup, locked with the recovery passphrase. Argon2id makes
// every passphrase guess expensive (64 MiB of memory each), so a stolen backup can't be
// brute-forced quickly; AES-256-GCM then encrypts the private keys.
export const KDF_DEFAULTS = Object.freeze({
  alg: 'argon2id',
  memoryKiB: 65536,
  passes: 3,
  parallelism: 1,
});
const BACKUP_VERSION = 1;
const AAD = utf8('adda/v1/keyring');

/**
 * Argon2id in a short-lived Web Worker in browsers (frees its 64 MiB right after and keeps the
 * screen responsive); directly where workers don't exist (tests, Node).
 */
function runArgon2(options) {
  if (typeof Worker === 'undefined' || typeof window === 'undefined') {
    return argon2id({ ...options, outputType: 'binary' });
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./argon2.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.ok) resolve(data.hash);
      else reject(new Error(data.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Couldn’t run the passphrase check'));
    };
    worker.postMessage(options);
  });
}

async function deriveBackupKey(passphrase, salt, kdf) {
  if (kdf.alg !== 'argon2id') throw new Error('Unsupported backup format');
  const raw = await runArgon2({
    password: passphrase.normalize('NFKC'),
    salt,
    memorySize: kdf.memoryKiB,
    iterations: kdf.passes,
    parallelism: kdf.parallelism,
    hashLength: 32,
  });
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/**
 * @param {{ keyId: string, privateKeyPkcs8: string, publicKey: string }[]} keyring
 * @param {string} passphrase
 */
export async function encryptKeyring(keyring, passphrase, kdf = KDF_DEFAULTS) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveBackupKey(passphrase, salt, kdf);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: AAD },
    key,
    utf8(JSON.stringify({ keys: keyring })),
  );
  return {
    v: BACKUP_VERSION,
    kdf: { ...kdf, salt: bytesToBase64Url(salt) },
    iv: bytesToBase64Url(iv),
    ct: bytesToBase64Url(ciphertext),
  };
}

/** The keyring, or an error with code WRONG_PASSPHRASE. */
export async function decryptKeyring(backup, passphrase) {
  if (backup?.v !== BACKUP_VERSION) throw new Error('Unsupported backup format');
  const key = await deriveBackupKey(passphrase, base64UrlToBytes(backup.kdf.salt), backup.kdf);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlToBytes(backup.iv), additionalData: AAD },
      key,
      base64UrlToBytes(backup.ct),
    );
  } catch {
    throw Object.assign(new Error('That passphrase isn’t right'), { code: 'WRONG_PASSPHRASE' });
  }
  return JSON.parse(fromUtf8(new Uint8Array(plaintext))).keys;
}

/** What a recovery password must contain (shown as a live checklist while typing). */
export const RECOVERY_RULES = [
  { label: 'At least 6 characters', test: (value) => value.length >= 6 },
  { label: 'An uppercase letter (A–Z)', test: (value) => /[A-Z]/.test(value) },
  { label: 'A lowercase letter (a–z)', test: (value) => /[a-z]/.test(value) },
  { label: 'A number (0–9)', test: (value) => /\d/.test(value) },
  { label: 'A symbol (like ! @ # $ %)', test: (value) => /[^A-Za-z0-9\s]/.test(value) },
];

/**
 * Why a new recovery password isn't accepted yet, or null. Every guess against the backup costs
 * an Argon2id run (64 MiB, 3 passes), so a short password that mixes all four kinds of
 * characters is still slow to crack.
 */
export function passphraseProblem(passphrase) {
  const value = passphrase.normalize('NFKC').trim();
  const missing = RECOVERY_RULES.find((rule) => !rule.test(value));
  if (missing) return `Add: ${missing.label.toLowerCase()}`;
  if (new Set(value).size < 5) return 'Use more different characters.';
  return null;
}
