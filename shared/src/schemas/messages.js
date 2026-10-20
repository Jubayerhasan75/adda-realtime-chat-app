import { z } from 'zod';
import { LIMITS } from '../limits.js';
import { cleanText } from './fields.js';
import { objectIdField } from './friends.js';
import { anyEnvelopeSchema } from './keys.js';

export const messageTextField = z
  .string()
  .transform(cleanText)
  .pipe(
    z
      .string()
      .min(1, 'Message is empty')
      .max(
        LIMITS.MESSAGE_TEXT_MAX,
        `Messages can be at most ${LIMITS.MESSAGE_TEXT_MAX} characters`,
      ),
  );

/** Per-send id from the client; makes retries idempotent (docs/ARCHITECTURE.md §7). */
export const clientMessageIdField = z.uuid('Invalid message id');

const seqField = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const startConversationSchema = z.strictObject({ peerUserId: objectIdField });

/**
 * A message as the server receives it: only an encrypted envelope (docs/E2EE.md §3), never
 * readable text. Photos/videos are referenced by upload id; their keys are inside the envelope.
 */
const messageContentFields = {
  clientMessageId: clientMessageIdField,
  envelope: anyEnvelopeSchema,
  attachmentIds: z
    .array(objectIdField)
    .min(1)
    .max(LIMITS.MESSAGE_MAX_BLOBS, 'Too many files in one message')
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate attachment')
    .optional(),
  replyToId: objectIdField.optional(),
};

export const sendMessageSchema = z.strictObject({
  conversationId: objectIdField,
  ...messageContentFields,
});

/** Body of the REST fallback POST /api/conversations/:id/messages (id comes from the URL). */
export const sendMessageBodySchema = z.strictObject(messageContentFields);

export const receiptSchema = z.strictObject({ conversationId: objectIdField, upToSeq: seqField });

export const readBodySchema = receiptSchema.omit({ conversationId: true });

export const typingSchema = z.strictObject({ conversationId: objectIdField });

export const presenceVisibilitySchema = z.strictObject({ visible: z.boolean() });

export const presenceRefreshSchema = z.strictObject({}).optional();

export const MESSAGE_PAGE_SIZE = 30;

/** "Media and links": pages of messages that have photos/videos, newest first. */
export const mediaHistorySchema = z.strictObject({
  before: seqField.optional(),
  limit: z.coerce.number().int().min(1).max(60).default(30),
});

export const messageHistorySchema = z
  .strictObject({
    before: seqField.optional(),
    after: seqField.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(MESSAGE_PAGE_SIZE),
  })
  .refine((query) => query.before === undefined || query.after === undefined, {
    message: 'Use either before or after, not both',
  });
