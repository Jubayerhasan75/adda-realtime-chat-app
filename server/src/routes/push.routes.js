import { Router } from 'express';
import { ERROR_CODES, pushSubscriptionSchema, pushUnsubscribeSchema } from '@chat/shared';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { AppError } from '../utils/AppError.js';

const push = (req) => req.app.locals.services.push;

/** /api/notifications — Web Push subscriptions of the current login session (docs/API.md §2.11). */
export function createPushRouter() {
  const router = Router();

  router.get('/vapid-public-key', requireAuth, (req, res) => {
    res.json({ data: { publicKey: push(req).publicKey } });
  });

  router.post(
    '/subscriptions',
    requireAuth,
    validateBody(pushSubscriptionSchema),
    async (req, res) => {
      if (!push(req).configured) {
        throw new AppError(503, ERROR_CODES.PROVIDER_UNAVAILABLE, 'Notifications aren’t set up');
      }
      await push(req).subscribe(
        req.auth.user,
        req.auth.session._id,
        req.body,
        req.get('user-agent'),
      );
      res.status(204).end();
    },
  );

  router.delete(
    '/subscriptions',
    requireAuth,
    validateBody(pushUnsubscribeSchema),
    async (req, res) => {
      await push(req).unsubscribe(req.auth.user, req.body.endpoint);
      res.status(204).end();
    },
  );

  return router;
}
