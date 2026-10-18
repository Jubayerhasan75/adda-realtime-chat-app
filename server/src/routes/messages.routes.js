import { Router } from 'express';
import { deleteMessageQuerySchema, editMessageSchema, reactionSchema } from '@chat/shared';
import * as messages from '../controllers/messages.controller.js';
import { requireVerified } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';

/** /api/messages/:messageId — actions on one message (membership checked in the service). */
export function createMessagesRouter(limits) {
  const router = Router();
  router.use(requireVerified, limits.messageActions);

  router.patch('/:messageId', validateBody(editMessageSchema), messages.edit);
  router.delete('/:messageId', validateQuery(deleteMessageQuerySchema), messages.remove);
  router.put('/:messageId/reaction', validateBody(reactionSchema), messages.react);
  router.delete('/:messageId/reaction', messages.unreact);
  router.put('/:messageId/pin', messages.pin);
  router.delete('/:messageId/pin', messages.unpin);

  return router;
}
