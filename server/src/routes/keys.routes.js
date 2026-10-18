import { Router } from 'express';
import { replaceBackupSchema, rotateKeysSchema, setupKeysSchema } from '@chat/shared';
import { requireVerified } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { requestInfo } from '../utils/requestInfo.js';

const keys = (req) => req.app.locals.services.keys;

/** /api/keys — end-to-end encryption keys (docs/E2EE.md §2, docs/API.md §2.12). */
export function createKeysRouter(limits) {
  const router = Router();
  router.use(requireVerified);

  router.get('/me', async (req, res) => {
    res.json({ data: await keys(req).mine(req.auth.user) });
  });
  router.post('/setup', validateBody(setupKeysSchema), async (req, res) => {
    res.status(201).json({ data: await keys(req).setup(req.auth.user, req.body) });
  });
  router.post('/rotate', limits.sensitive, validateBody(rotateKeysSchema), async (req, res) => {
    res.json({ data: await keys(req).rotate(req.auth.user, req.body, requestInfo(req)) });
  });
  router.put('/backup', limits.sensitive, validateBody(replaceBackupSchema), async (req, res) => {
    await keys(req).replaceBackup(req.auth.user, req.body);
    res.status(204).end();
  });
  router.get('/users/:userId', async (req, res) => {
    res.json({ data: await keys(req).publicKeysOf(req.auth.user, req.params.userId) });
  });

  return router;
}
