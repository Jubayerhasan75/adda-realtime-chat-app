import { z } from 'zod';
import { COMMON_PASSWORDS } from '../commonPasswords.js';
import { LIMITS } from '../limits.js';

// Control characters (except tab/newline) and bidi overrides can hide or spoof text.
// eslint-disable-next-line no-control-regex -- matching control characters is the purpose
const UNSAFE_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;

/** Trims, NFC-normalizes and removes control/bidi-override characters. */
export function cleanText(value) {
  return value.normalize('NFC').replace(UNSAFE_CHARS, '').trim();
}

const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'support',
  'help',
  'moderator',
  'security',
  'official',
  'staff',
  'api',
  'www',
  'mail',
  'settings',
  'privatechat',
  'null',
  'undefined',
]);

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(LIMITS.EMAIL_MAX, 'Email address is too long')
  .pipe(z.email('Enter a valid email address'));

export const usernameField = z
  .string()
  .trim()
  .toLowerCase()
  .min(LIMITS.USERNAME_MIN, `Use at least ${LIMITS.USERNAME_MIN} characters`)
  .max(LIMITS.USERNAME_MAX, `Use at most ${LIMITS.USERNAME_MAX} characters`)
  .regex(/^[a-z0-9._]+$/, 'Use only letters, numbers, dots and underscores')
  .regex(/^[a-z0-9].*[a-z0-9]$/, 'Start and end with a letter or number')
  .refine((value) => !/[._]{2}/.test(value), 'Dots and underscores cannot be next to each other')
  .refine((value) => !RESERVED_USERNAMES.has(value), 'This username is not available');

export const displayNameField = z
  .string()
  .transform(cleanText)
  .pipe(
    z
      .string()
      .min(1, 'Enter a display name')
      .max(LIMITS.DISPLAY_NAME_MAX, `Use at most ${LIMITS.DISPLAY_NAME_MAX} characters`),
  );

export const bioField = z
  .string()
  .transform(cleanText)
  .pipe(z.string().max(LIMITS.BIO_MAX, `Use at most ${LIMITS.BIO_MAX} characters`));

/** A new password. Existing passwords are only checked for presence (see `currentPasswordField`). */
export const newPasswordField = z
  .string()
  .min(LIMITS.PASSWORD_MIN, `Use at least ${LIMITS.PASSWORD_MIN} characters`)
  .max(LIMITS.PASSWORD_MAX, `Use at most ${LIMITS.PASSWORD_MAX} characters`)
  .refine(
    (value) => !COMMON_PASSWORDS.has(value.toLowerCase()) && !/^(.)\1+$/.test(value),
    'This password is too common. Choose something harder to guess',
  );

export const currentPasswordField = z
  .string()
  .min(1, 'Enter your password')
  .max(LIMITS.PASSWORD_MAX, 'Password is too long');

/** 32 random bytes encoded as base64url (43 characters), as sent in email links. */
export const emailTokenField = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'This link is invalid');

/** True when the password contains the username or the email's local part. */
export function passwordContainsIdentity(password, { username, email }) {
  const lower = password.toLowerCase();
  const localPart = email?.split('@')[0];
  return [username, localPart].some((part) => part && part.length >= 3 && lower.includes(part));
}
