import { Router } from 'express';

/**
 * DEVELOPMENT-ONLY: lists the emails the console mail transport "sent", so verification and
 * reset links can be opened from the browser at /dev/mailbox. app.js registers this only when
 * NODE_ENV=development and MAIL_TRANSPORT=console; production refuses to start with either.
 */
export function createDevMailboxRouter() {
  const router = Router();

  router.get('/mailbox', (req, res) => {
    res.json({ data: req.app.locals.mailer.devMailbox ?? [] });
  });

  return router;
}
