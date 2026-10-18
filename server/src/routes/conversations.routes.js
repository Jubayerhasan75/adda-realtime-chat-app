import { Router } from 'express';
import {
  conversationSettingsSchema,
  messageHistorySchema,
  readBodySchema,
  sendMessageBodySchema,
  startConversationSchema,
} from '@chat/shared';
import * as conversations from '../controllers/conversations.controller.js';
import * as messages from '../controllers/messages.controller.js';
import { requireVerified } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';

/** /api/conversations — every route checks membership in the service (404 otherwise). */
export function createConversationsRouter(limits) {
  const router = Router();
  router.use(requireVerified);

  router.get('/', conversations.list);
  router.post('/', validateBody(startConversationSchema), conversations.open);
  router.get('/:conversationId', conversations.get);
  router.get(
    '/:conversationId/messages',
    validateQuery(messageHistorySchema),
    conversations.listMessages,
  );
  router.post(
    '/:conversationId/messages',
    limits.messages,
    validateBody(sendMessageBodySchema),
    conversations.sendMessage,
  );
  router.post('/:conversationId/read', validateBody(readBodySchema), conversations.markRead);
  router.get('/:conversationId/pins', messages.listPins);
  router.post('/:conversationId/clear', messages.clearChat);
  router.delete('/:conversationId', messages.deleteChat);
  router.patch(
    '/:conversationId/settings',
    validateBody(conversationSettingsSchema),
    messages.updateSettings,
  );

  return router;
}
