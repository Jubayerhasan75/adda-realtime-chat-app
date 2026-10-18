import { Router } from 'express';
import {
  changeUsernameSchema,
  deleteAccountSchema,
  updateProfileSchema,
  updateSettingsSchema,
} from '@chat/shared';
import * as users from '../controllers/users.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

/** @param {ReturnType<import('../middleware/rateLimits.js').createRateLimiters>} limits */
export function createUsersRouter(limits) {
  const router = Router();
  router.use(requireAuth);

  router.get('/me', users.getMe);
  router.patch('/me', validateBody(updateProfileSchema), users.updateProfile);
  router.patch('/me/username', validateBody(changeUsernameSchema), users.changeUsername);
  router.delete('/me', limits.sensitive, validateBody(deleteAccountSchema), users.deleteMe);

  return router;
}

export function createSettingsRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get('/', users.getSettings);
  router.patch('/', validateBody(updateSettingsSchema), users.updateSettings);

  return router;
}
