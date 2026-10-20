import mongoose from 'mongoose';
import { LIMITS } from '@chat/shared';

const { Schema } = mongoose;

const reactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true, maxlength: 32 },
    at: { type: Date, required: true },
  },
  { _id: false },
);

/** A snapshot of an attachment at send time, so history renders without extra lookups. */
const attachmentRefSchema = new Schema(
  {
    attachmentId: { type: Schema.Types.ObjectId, ref: 'Attachment', required: true },
    kind: { type: String, enum: ['image', 'video', 'blob'], required: true },
    mimeType: { type: String, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    durationMs: { type: Number, default: null },
    size: { type: Number, required: true },
  },
  { _id: false },
);

const gifSchema = new Schema(
  {
    provider: { type: String, required: true },
    id: { type: String, required: true },
    title: { type: String, default: '' },
    url: { type: String, required: true },
    previewUrl: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  { _id: false },
);

/**
 * One message (docs/DATABASE.md §2.8): text, photos/videos with an optional caption, or a GIF.
 * Arrays stay bounded: one reaction per participant, `hiddenFor` at most two users, at most
 * LIMITS.MAX_ATTACHMENTS attachments.
 */
const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    seq: { type: Number, required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    clientMessageId: { type: String, required: true },
    // 'e2ee' = an end-to-end encrypted message (docs/E2EE.md): the content is only in
    // `envelope`, which the server can't read. 'media' = the same, with photos/videos.
    // 'system' = a group change ("Nadia added Arif"), see `system`.
    type: { type: String, enum: ['text', 'media', 'gif', 'e2ee', 'system'], default: 'e2ee' },
    system: {
      type: new Schema(
        {
          action: {
            type: String,
            enum: ['created', 'added', 'removed', 'left', 'renamed', 'photo', 'admin'],
            required: true,
          },
          targetIds: { type: [Schema.Types.ObjectId], default: [] },
          name: { type: String, maxlength: 100, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    envelope: { type: Schema.Types.Mixed, default: null },
    // Legacy plaintext fields, never written any more (always null).
    text: { type: String, maxlength: LIMITS.MESSAGE_TEXT_MAX, default: null },
    attachments: { type: [attachmentRefSchema], default: [] },
    gif: { type: gifSchema, default: null },
    replyToId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    reactions: { type: [reactionSchema], default: [] },
    editedAt: { type: Date, default: null },
    unsentAt: { type: Date, default: null },
    // "Delete for me": users who no longer see this message.
    hiddenFor: { type: [Schema.Types.ObjectId], default: [] },
    pinnedAt: { type: Date, default: null },
    pinnedBy: { type: Schema.Types.ObjectId, default: null },
    // Incremented on every change, so clients can ignore stale updates.
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);

// Ordering, pagination and unread counts.
messageSchema.index({ conversationId: 1, seq: -1 }, { unique: true });
// Idempotent sends: the same client id from the same sender is stored once.
messageSchema.index({ senderId: 1, clientMessageId: 1 }, { unique: true });
// Pinned messages of a conversation.
messageSchema.index(
  { conversationId: 1, pinnedAt: -1 },
  { partialFilterExpression: { pinnedAt: { $type: 'date' } } },
);

export const Message = mongoose.model('Message', messageSchema);
