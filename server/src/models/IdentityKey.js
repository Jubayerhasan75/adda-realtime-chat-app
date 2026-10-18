import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A person's end-to-end encryption public key (docs/E2EE.md §2). The newest one is used for new
 * messages; older ones stay so old messages remain readable. Private keys never reach the server.
 */
const identityKeySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    keyId: { type: String, required: true },
    publicKey: { type: String, required: true },
  },
  { timestamps: true },
);

identityKeySchema.index({ userId: 1, createdAt: -1 });
identityKeySchema.index({ userId: 1, keyId: 1 }, { unique: true });

export const IdentityKey = mongoose.model('IdentityKey', identityKeySchema);
