import mongoose from 'mongoose';
import { UPLOAD_PURPOSES } from '@chat/shared';

const { Schema } = mongoose;

/**
 * An uploaded photo or video (docs/DATABASE.md §2.9).
 * Life cycle: pending (upload started) → ready (verified) → attached (sent in a message or set
 * as an avatar) → deleting (unsent, replaced, expired or cancelled; the cleanup job removes it
 * from storage and then deletes this document).
 */
const attachmentSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: UPLOAD_PURPOSES, required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', default: null },
    messageId: { type: Schema.Types.ObjectId, ref: 'Message', default: null },
    kind: { type: String, enum: ['image', 'video'], required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    durationMs: { type: Number, default: null },
    // Where the file lives. Never sent to clients.
    storage: {
      provider: { type: String, required: true },
      key: { type: String, required: true },
    },
    status: {
      type: String,
      enum: ['pending', 'ready', 'attached', 'deleting'],
      default: 'pending',
    },
    // Uploads that are never sent are cleaned up after this time.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

attachmentSchema.index({ ownerId: 1, status: 1 });
attachmentSchema.index({ status: 1, expiresAt: 1 });
attachmentSchema.index(
  { messageId: 1 },
  { partialFilterExpression: { messageId: { $type: 'objectId' } } },
);

export const Attachment = mongoose.model('Attachment', attachmentSchema);
