import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One group key (of one epoch) locked for one member (docs/GROUPS.md §3). The server can't open
 * it: `box` is encrypted with a key only the giver's and the member's devices can compute.
 */
const groupKeyBoxSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    epoch: { type: Number, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fromUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    box: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

groupKeyBoxSchema.index({ conversationId: 1, userId: 1, epoch: 1 }, { unique: true });

export const GroupKeyBox = mongoose.model('GroupKeyBox', groupKeyBoxSchema);
