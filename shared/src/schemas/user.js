import { z } from 'zod';
import { bioField, currentPasswordField, displayNameField, usernameField } from './fields.js';

export const updateProfileSchema = z
  .strictObject({ displayName: displayNameField.optional(), bio: bioField.optional() })
  .refine((data) => Object.keys(data).length > 0, 'Nothing to update');

export const changeUsernameSchema = z.strictObject({ username: usernameField });

export const deleteAccountSchema = z.strictObject({
  password: currentPasswordField,
  confirm: z.literal('DELETE', { error: 'Type DELETE to confirm' }),
});

export const THEMES = ['system', 'light', 'dark'];
export const VISIBILITY = ['friends', 'nobody'];
export const NOTIFICATION_PREVIEWS = ['name_and_text', 'name_only', 'none'];

/** Partial update of user settings; every level is strict so unknown keys are rejected. */
export const updateSettingsSchema = z
  .strictObject({
    theme: z.enum(THEMES).optional(),
    privacy: z
      .strictObject({
        lastSeen: z.enum(VISIBILITY).optional(),
        onlineStatus: z.enum(VISIBILITY).optional(),
        readReceipts: z.boolean().optional(),
        discoverable: z.boolean().optional(),
      })
      .optional(),
    notifications: z
      .strictObject({
        enabled: z.boolean().optional(),
        preview: z.enum(NOTIFICATION_PREVIEWS).optional(),
        friendRequests: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'Nothing to update');
