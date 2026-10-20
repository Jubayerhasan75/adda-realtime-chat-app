import mongoose from 'mongoose';
import { isChatAccent } from '@chat/shared';

const { Schema } = mongoose;

/**
 * A chat between people (docs/DATABASE.md §2.6): two friends ('direct') or a group
 * (docs/GROUPS.md). `lastSeq` is incremented atomically for every message, giving each message
 * a gap-free, never-changing position within the conversation.
 */
const conversationSchema = new Schema(
  {
    type: { type: String, enum: ['direct', 'group'], default: 'direct' },
    participantIds: { type: [Schema.Types.ObjectId], required: true },
    // Direct chats only — sorted pair of user ids: one direct conversation per pair, even under
    // concurrent creation.
    directKey: {
      type: String,
      required() {
        return this.type === 'direct';
      },
    },
    // Groups only.
    name: { type: String, maxlength: 100, default: null },
    photo: {
      type: new Schema(
        { attachmentId: { type: Schema.Types.ObjectId, required: true }, v: Number },
        { _id: false },
      ),
      default: null,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Shared by everyone in the chat (preset name or #rrggbb); null = default.
    accent: {
      type: String,
      default: null,
      validate: { validator: (value) => value === null || isChatAccent(value) },
    },
    // Nicknames, end-to-end encrypted: who set it and the notice's message id (for decryption).
    nicknames: {
      type: [
        new Schema(
          {
            userId: { type: Schema.Types.ObjectId, required: true },
            setBy: { type: Schema.Types.ObjectId, required: true },
            clientMessageId: { type: String, required: true },
            envelope: { type: Schema.Types.Mixed, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    // Number of the current group key; a new one is required after someone leaves.
    keyEpoch: { type: Number, default: 0 },
    rotationNeeded: { type: Boolean, default: false },
    lastSeq: { type: Number, default: 0 },
    lastMessageId: { type: Schema.Types.ObjectId, default: null },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true },
);

conversationSchema.index(
  { directKey: 1 },
  { unique: true, partialFilterExpression: { directKey: { $type: 'string' } } },
);
conversationSchema.index({ participantIds: 1 });

export const Conversation = mongoose.model('Conversation', conversationSchema);
