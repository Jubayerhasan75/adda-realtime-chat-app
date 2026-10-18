import { Router } from 'express';
import {
  blockSchema,
  friendRequestSchema,
  markNotificationsReadSchema,
  reportSchema,
  userSearchSchema,
} from '@chat/shared';
import * as friends from '../controllers/friends.controller.js';
import { requireVerified } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';

/** /api/friends — requests, friends list and blocks. Verified users only. */
export function createFriendsRouter(limits) {
  const router = Router();
  router.use(requireVerified);

  router.get('/', friends.listFriends);
  router.get('/requests', friends.listRequests);
  router.post(
    '/requests',
    limits.friendRequests,
    validateBody(friendRequestSchema),
    friends.sendRequest,
  );
  router.post('/requests/:requestId/accept', friends.acceptRequest);
  router.post('/requests/:requestId/decline', friends.declineRequest);
  router.delete('/requests/:requestId', friends.cancelRequest);
  router.get('/blocks', friends.listBlocked);
  router.post('/blocks', validateBody(blockSchema), friends.block);
  router.delete('/blocks/:userId', friends.unblock);
  router.delete('/:userId', friends.removeFriend);

  return router;
}

/** Search, profiles and reports, mounted under /api/users (after /me routes). */
export function createDirectoryRouter(limits) {
  const router = Router();
  router.use(requireVerified);

  router.get('/search', limits.search, validateQuery(userSearchSchema), friends.search);
  router.post('/:userId/report', limits.reports, validateBody(reportSchema), friends.report);
  router.get('/:username', friends.getProfile);

  return router;
}

/** /api/notifications — in-app feed. */
export function createNotificationsRouter() {
  const router = Router();
  router.use(requireVerified);

  router.get('/', friends.getNotifications);
  router.post('/read', validateBody(markNotificationsReadSchema), friends.readNotifications);

  return router;
}
