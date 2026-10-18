import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One document per pair of users (docs/DATABASE.md §2.4). `pairKey` is the two ids sorted and
 * joined, so the unique index makes duplicate or crossed requests impossible even when two
 * requests race.
 */
const friendshipSchema = new Schema(
  {
    pairKey: { type: String, required: true },
    userIds: { type: [Schema.Types.ObjectId], required: true },
    requesterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], required: true },
    respondedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

friendshipSchema.index({ pairKey: 1 }, { unique: true });
friendshipSchema.index({ recipientId: 1, status: 1, createdAt: -1 });
friendshipSchema.index({ requesterId: 1, status: 1, createdAt: -1 });
friendshipSchema.index({ userIds: 1, status: 1, respondedAt: -1 });

/** Stable key for a pair of users, independent of order. */
export function pairKeyOf(a, b) {
  return [String(a), String(b)].sort().join(':');
}

export const Friendship = mongoose.model('Friendship', friendshipSchema);
