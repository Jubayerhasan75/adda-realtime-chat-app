import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256-bit random token, URL-safe (43 characters). Used for session cookies and email links. */
export function generateToken() {
  return randomBytes(32).toString('base64url');
}

/** Tokens are stored only as SHA-256 hashes, so a database leak does not expose live tokens. */
export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time string comparison (avoids leaking how many leading characters matched). */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}
