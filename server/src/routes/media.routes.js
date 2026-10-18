import { Router } from 'express';
import {
  completeUploadSchema,
  createUploadSchema,
  mediaVariantSchema,
  setAvatarSchema,
} from '@chat/shared';
import * as media from '../controllers/media.controller.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';

/**
 * /api/media — uploads and authorized viewing (docs/API.md §2.9).
 * @param {ReturnType<import('../middleware/rateLimits.js').createRateLimiters>} limits
 * @param {{ localStorage: boolean }} options
 */
export function createMediaRouter(limits, { localStorage }) {
  const router = Router();

  if (localStorage) {
    // Development/test storage only: signed links stand in for Cloudinary's.
    router.post('/local-upload', requireVerified, media.localUpload);
    router.get('/local-file/:name', media.localFile);
  }

  router.use(requireVerified);
  router.post('/uploads', limits.uploads, validateBody(createUploadSchema), media.createUpload);
  router.post(
    '/uploads/:attachmentId/complete',
    validateBody(completeUploadSchema),
    media.completeUpload,
  );
  router.delete('/uploads/:attachmentId', media.cancelUpload);
  router.get('/:attachmentId', validateQuery(mediaVariantSchema), media.view);

  return router;
}

/** /api/users/me/avatar */
export function createAvatarRouter() {
  const router = Router();
  router.use(requireAuth);
  router.put('/', validateBody(setAvatarSchema), media.setAvatar);
  router.delete('/', media.removeAvatar);
  return router;
}

/** /api/gifs */
export function createGifsRouter() {
  const router = Router();
  router.use(requireVerified);
  router.get('/config', media.gifConfig);
  return router;
}
