import mongoose from 'mongoose';

const { Schema } = mongoose;

const RETENTION_SECONDS = 90 * 24 * 60 * 60;

/** Account events that also appear in the user's notification feed as security alerts. */
export const SECURITY_ALERT_EVENTS = [
  'login',
  'password_changed',
  'password_reset',
  'email_changed',
  'username_changed',
  'encryption_reset',
];

/**
 * In-app notification feed entry: friend activity (with the other person as `actorId`) or a
 * security alert about my own account (`event`, plus the device it came from). Message
 * notifications are not stored here (unread counts cover them).
 */
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['friend_request', 'friend_accepted', 'security'], required: true },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required() {
        return this.type !== 'security';
      },
      default: null,
    },
    event: { type: String, enum: [...SECURITY_ALERT_EVENTS, null], default: null },
    device: { type: String, maxlength: 80, default: '' },
    friendshipId: { type: Schema.Types.ObjectId, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index({ friendshipId: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });

export const Notification = mongoose.model('Notification', notificationSchema);
