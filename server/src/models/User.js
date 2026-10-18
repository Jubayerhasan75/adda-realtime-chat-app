import mongoose from 'mongoose';
import { LIMITS, NOTIFICATION_PREVIEWS, THEMES, VISIBILITY } from '@chat/shared';

const { Schema } = mongoose;

const settingsSchema = new Schema(
  {
    theme: { type: String, enum: THEMES, default: 'system' },
    privacy: {
      lastSeen: { type: String, enum: VISIBILITY, default: 'friends' },
      onlineStatus: { type: String, enum: VISIBILITY, default: 'friends' },
      readReceipts: { type: Boolean, default: true },
      discoverable: { type: Boolean, default: true },
    },
    notifications: {
      enabled: { type: Boolean, default: true },
      preview: { type: String, enum: NOTIFICATION_PREVIEWS, default: 'name_only' },
      friendRequests: { type: Boolean, default: true },
    },
  },
  { _id: false },
);

// Deleted accounts become tombstones without email/username, so uniqueness only applies
// to documents that still have the field.
const uniqueWhenPresent = (field) => ({
  unique: true,
  partialFilterExpression: { [field]: { $type: 'string' } },
});

const userSchema = new Schema(
  {
    email: { type: String, lowercase: true, trim: true, maxlength: LIMITS.EMAIL_MAX },
    emailVerifiedAt: { type: Date, default: null },
    passwordHash: { type: String, select: false },
    username: { type: String, lowercase: true, trim: true, maxlength: LIMITS.USERNAME_MAX },
    usernameChangedAt: { type: Date, default: null },
    displayName: { type: String, maxlength: LIMITS.DISPLAY_NAME_MAX },
    bio: { type: String, maxlength: LIMITS.BIO_MAX, default: '' },
    avatar: { type: { attachmentId: Schema.Types.ObjectId, version: Number }, default: null },
    settings: { type: settingsSchema, default: () => ({}) },
    lastSeenAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'deleted'], default: 'active' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, uniqueWhenPresent('email'));
userSchema.index({ username: 1 }, uniqueWhenPresent('username'));

export const User = mongoose.model('User', userSchema);
