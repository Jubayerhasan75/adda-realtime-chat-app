import { z } from 'zod';
import { LIMITS } from '../limits.js';
import { objectIdField } from './friends.js';

/**
 * File types that can be uploaded (docs/DATABASE.md §2.9). HEIC/HEIF photos from iPhones are
 * accepted because the media provider converts them for other devices.
 */
export const MEDIA_MIME_TYPES = Object.freeze({
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
});

export const MEDIA_MAX_BYTES = Object.freeze({
  image: LIMITS.IMAGE_MAX_BYTES,
  video: LIMITS.VIDEO_MAX_BYTES,
});

/** "image" | "video" for an allowed MIME type, otherwise null. */
export function mediaKindOf(mimeType) {
  const type = String(mimeType ?? '').toLowerCase();
  if (MEDIA_MIME_TYPES.image.includes(type)) return 'image';
  if (MEDIA_MIME_TYPES.video.includes(type)) return 'video';
  return null;
}

export const UPLOAD_PURPOSES = ['message', 'avatar'];

/** Step 1 of an upload. Type and size are checked by the server with specific error codes. */
export const createUploadSchema = z
  .strictObject({
    purpose: z.enum(UPLOAD_PURPOSES),
    conversationId: objectIdField.optional(),
    mimeType: z.string().trim().toLowerCase().min(1).max(100),
    size: z.number().int().min(1, 'The file is empty').max(Number.MAX_SAFE_INTEGER),
  })
  .refine((data) => data.purpose !== 'message' || data.conversationId, {
    path: ['conversationId'],
    message: 'conversationId is required for message attachments',
  });

const dimension = z.number().int().min(1).max(20_000);

/**
 * Step 3: the upload finished. The size hints are only used when the storage provider can't
 * measure the file itself (the local development storage); real values always win.
 */
export const completeUploadSchema = z.strictObject({
  width: dimension.optional(),
  height: dimension.optional(),
  durationMs: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 * 60 * 1000)
    .optional(),
});

// 'download' = full quality, delivered as a file to save (Content-Disposition: attachment).
export const MEDIA_VARIANTS = ['thumb', 'full', 'poster', 'avatar', 'download'];

export const mediaVariantSchema = z.strictObject({
  variant: z.enum(MEDIA_VARIANTS).default('full'),
  // Cache-busting version on avatar URLs; not used by the server.
  v: z.string().max(20).optional(),
});

export const setAvatarSchema = z.strictObject({ attachmentId: objectIdField });

/** GIFs are loaded straight from the provider's own media host, never from anywhere else. */
export const GIF_MEDIA_HOSTS = Object.freeze(['static.klipy.com']);

const gifUrl = z
  .url({ protocol: /^https$/, hostname: /^static\.klipy\.com$/ })
  .max(1000)
  .refine((value) => GIF_MEDIA_HOSTS.includes(new URL(value).hostname), 'Unsupported GIF host');

export const gifField = z.strictObject({
  provider: z.literal('klipy'),
  id: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).default(''),
  url: gifUrl,
  previewUrl: gifUrl,
  width: dimension,
  height: dimension,
});
