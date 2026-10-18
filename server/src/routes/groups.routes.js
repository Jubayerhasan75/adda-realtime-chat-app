import { Router } from 'express';
import {
  addGroupMembersSchema,
  createGroupSchema,
  groupKeyBoxesSchema,
  groupRoleSchema,
  rotateGroupKeySchema,
  updateGroupSchema,
} from '@chat/shared';
import * as groups from '../controllers/groups.controller.js';
import { requireVerified } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

/**
 * /api/groups — creating and managing group chats (docs/GROUPS.md). Messages, history and chat
 * settings use /api/conversations like direct chats. Every route checks membership (404).
 */
export function createGroupsRouter(limits) {
  const router = Router();
  router.use(requireVerified, limits.messageActions);

  router.post('/', validateBody(createGroupSchema), groups.create);
  router.patch('/:groupId', validateBody(updateGroupSchema), groups.update);
  router.post('/:groupId/members', validateBody(addGroupMembersSchema), groups.addMembers);
  router.delete('/:groupId/members/:userId', groups.removeMember);
  router.patch('/:groupId/members/:userId', validateBody(groupRoleSchema), groups.setRole);
  router.post('/:groupId/leave', groups.leave);
  router.get('/:groupId/keys', groups.myKeys);
  router.post('/:groupId/keys', validateBody(groupKeyBoxesSchema), groups.shareKeys);
  router.post('/:groupId/keys/request', groups.requestKeys);
  router.post('/:groupId/keys/rotate', validateBody(rotateGroupKeySchema), groups.rotateKey);

  return router;
}
