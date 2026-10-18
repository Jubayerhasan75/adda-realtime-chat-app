import { z } from 'zod';
import { cleanText } from './fields.js';

/** MongoDB ObjectId as a 24-character hex string. Validated before any database call. */
export const objectIdField = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');

export const userSearchSchema = z.strictObject({
  // Same alphabet as usernames; partial input like "jub" is allowed.
  q: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Type a username')
    .max(20)
    .regex(/^[a-z0-9._]+$/, 'Usernames only contain letters, numbers, dots and underscores'),
});

export const friendRequestSchema = z.strictObject({ userId: objectIdField });

export const blockSchema = z.strictObject({ userId: objectIdField });

export const REPORT_REASONS = ['spam', 'harassment', 'impersonation', 'inappropriate', 'other'];

export const reportSchema = z.strictObject({
  reason: z.enum(REPORT_REASONS, { error: 'Choose a reason' }),
  details: z
    .string()
    .transform(cleanText)
    .pipe(z.string().max(1000, 'Use at most 1000 characters'))
    .optional(),
});

export const markNotificationsReadSchema = z.union([
  z.strictObject({ ids: z.array(objectIdField).min(1).max(100) }),
  z.strictObject({ all: z.literal(true) }),
]);
