import argon2 from 'argon2';

// OWASP Password Storage Cheat Sheet minimum for Argon2id: 19 MiB memory, 2 iterations,
// 1 degree of parallelism. Kept modest so a small free-tier server can hash concurrently.
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash;
/**
 * Runs a full hash verification even when the account does not exist, so response time does
 * not reveal whether an email or username is registered.
 */
export async function verifyAgainstDummy(password) {
  dummyHash ??= await hashPassword('dummy-password-for-timing');
  await verifyPassword(dummyHash, password);
  return false;
}
