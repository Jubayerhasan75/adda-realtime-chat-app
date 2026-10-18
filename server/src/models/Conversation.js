import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A chat between people (docs/DATABASE.md §2.6). `lastSeq` is incremented atomically for every
 * message, giving each message a gap-free, never-changing position within the conversation.
 */
const conversationSchema = new Schema(
  {
    type: { type: String, enum: ['direct'], default: 'direct' },
    participantIds: { type: [Schema.Types.ObjectId], required: true },
    // Sorted pair of user ids: one direct conversation per pair, even under concurrent creation.
    directKey: { type: String, required: true },
    lastSeq: { type: Number, default: 0 },
    lastMessageId: { type: Schema.Types.ObjectId, default: null },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true },
);

conversationSchema.index({ directKey: 1 }, { unique: true });
conversationSchema.index({ participantIds: 1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
