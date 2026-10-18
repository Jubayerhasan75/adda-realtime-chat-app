import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Server-side login session. The cookie holds a random token; only its SHA-256 hash is stored. */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true },
    csrfToken: { type: String, required: true },
    lastUsedAt: { type: Date, required: true },
    idleExpiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    userAgent: { type: String, maxlength: 200, default: '' },
    ipPrefix: { type: String, maxlength: 64, default: '' },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ userId: 1, revokedAt: 1 });
// MongoDB deletes sessions automatically once their absolute lifetime has passed.
sessionSchema.index({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model('Session', sessionSchema);
