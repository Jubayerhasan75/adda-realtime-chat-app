import { Router } from 'express';
import { ERROR_CODES } from '@chat/shared';
import { AppError } from '../utils/AppError.js';

/**
 * TEST-ONLY routes for the end-to-end tests (docs/TESTING.md §2). Registered by app.js only
 * when NODE_ENV=test; production also refuses to start without real SMTP, so the in-memory
 * outbox read here can never exist there.
 */
export function createTestSupportRouter() {
  const router = Router();

  router.get('/last-email', (req, res) => {
    const to = String(req.query.to ?? '').toLowerCase();
    const mail = req.app.locals.mailer.outbox?.findLast((item) => item.to === to);
    if (!mail) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'No email for that address');
    res.json({ data: mail });
  });

  return router;
}
