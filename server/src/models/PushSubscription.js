import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A browser's push subscription (docs/DATABASE.md §2.10). Tied to the login session that
 * created it: logging out, revoking the session or deleting the account removes it, so a
 * signed-out device never receives messages.
 */
const pushSubscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    endpoint: { type: String, required: true, maxlength: 1000 },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: '', maxlength: 300 },
    lastSuccessAt: { type: Date, default: null },
    failureCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
pushSubscriptionSchema.index({ userId: 1 });
pushSubscriptionSchema.index({ sessionId: 1 });

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);
