import { z } from 'zod';
import { LIMITS } from '../limits.js';
import { cleanText } from './fields.js';
import { objectIdField } from './friends.js';
import { groupKeyBoxSchema } from './keys.js';

// docs/GROUPS.md

export const groupNameField = z
  .string()
  .transform(cleanText)
  .pipe(
    z
      .string()
      .min(1, 'Give the group a name')
      .max(LIMITS.GROUP_NAME_MAX, `Group names can be at most ${LIMITS.GROUP_NAME_MAX} characters`),
  );

const uniqueIds = (ids) => new Set(ids).size === ids.length;

const keyBoxes = z.array(groupKeyBoxSchema).max(LIMITS.GROUP_MAX_MEMBERS * 50);

/** New group: a name, at least 2 friends, and the first group key locked for every member. */
export const createGroupSchema = z.strictObject({
  name: groupNameField,
  memberIds: z
    .array(objectIdField)
    .min(2, 'Choose at least 2 friends')
    .max(LIMITS.GROUP_MAX_MEMBERS - 1, `Groups can have up to ${LIMITS.GROUP_MAX_MEMBERS} people`)
    .refine(uniqueIds, 'Duplicate member'),
  keyBoxes: keyBoxes.min(3),
});

/** Admins add friends; the group's keys (every epoch, for full history) come along. */
export const addGroupMembersSchema = z.strictObject({
  userIds: z
    .array(objectIdField)
    .min(1)
    .max(LIMITS.GROUP_MAX_MEMBERS - 1)
    .refine(uniqueIds, 'Duplicate member'),
  keyBoxes,
});

export const updateGroupSchema = z
  .strictObject({
    name: groupNameField.optional(),
    // An uploaded photo (purpose "avatar"), or null to remove it.
    photoAttachmentId: objectIdField.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Nothing to change');

export const groupRoleSchema = z.strictObject({ role: z.enum(['admin', 'member']) });

/** Keys given to members who are missing them (new key, key change, or a late joiner). */
export const groupKeyBoxesSchema = z.strictObject({ keyBoxes: keyBoxes.min(1) });

/** A new group key after someone left: locked for every remaining member. */
export const rotateGroupKeySchema = z.strictObject({
  epoch: z.number().int().min(2).max(1_000_000),
  keyBoxes: keyBoxes.min(1),
});
