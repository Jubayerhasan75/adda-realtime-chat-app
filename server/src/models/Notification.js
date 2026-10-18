import mongoose from 'mongoose';

const { Schema } = mongoose;

const RETENTION_SECONDS = 90 * 24 * 60 * 60;

/** In-app notification feed entry. Message notifications are not stored here (unread counts cover them). */
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['friend_request', 'friend_accepted'], required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
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
