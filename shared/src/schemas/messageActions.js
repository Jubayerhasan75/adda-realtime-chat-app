import { z } from 'zod';
import { isSingleEmoji } from '../emoji.js';
import { LIMITS } from '../limits.js';
import { objectIdField } from './friends.js';
import { anyEnvelopeSchema } from './keys.js';

/** An edit replaces the encrypted envelope (the server never sees the new text). */
export const editMessageSchema = z.strictObject({ envelope: anyEnvelopeSchema });

export const deleteMessageQuerySchema = z.strictObject({
  scope: z.enum(['me', 'everyone'], { error: 'scope must be "me" or "everyone"' }),
});

export const reactionSchema = z.strictObject({
  emoji: z.string().refine(isSingleEmoji, 'Use a single emoji'),
});

/** Chat colors: a preset, or any color as #rrggbb (never arbitrary CSS). `null` = default. */
export const CHAT_ACCENTS = ['teakhelet', 'ocean', 'forest', 'sunset', 'rose', 'graphite'];
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;
export const isChatAccent = (value) => CHAT_ACCENTS.includes(value) || HEX_COLOR.test(value);

export const conversationSettingsSchema = z
  .strictObject({
    // ISO date until which notifications are muted; a far-future date means "until unmuted".
    mutedUntil: z.iso.datetime().nullable().optional(),
    accent: z
      .string()
      .refine(isChatAccent, 'Choose a preset or a #rrggbb color')
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Nothing to update');

export const messageSearchSchema = z.strictObject({
  q: z
    .string()
    .trim()
    .min(LIMITS.SEARCH_QUERY_MIN, `Type at least ${LIMITS.SEARCH_QUERY_MIN} characters`)
    .max(LIMITS.SEARCH_QUERY_MAX),
  conversationId: objectIdField.optional(),
});
