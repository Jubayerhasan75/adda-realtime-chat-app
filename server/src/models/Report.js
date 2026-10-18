import mongoose from 'mongoose';
import { REPORT_REASONS } from '@chat/shared';

const { Schema } = mongoose;

/** Abuse report, stored for manual review (no moderator UI in v1, docs/SECURITY.md §8). */
const reportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Message reports arrive with messaging (Phase 6/7); null for profile reports.
    messageId: { type: Schema.Types.ObjectId, default: null },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, maxlength: 1000, default: '' },
    status: { type: String, enum: ['open', 'reviewed', 'closed'], default: 'open' },
  },
  { timestamps: true },
);

reportSchema.index({ reporterId: 1, targetUserId: 1, messageId: 1 }, { unique: true });
reportSchema.index({ targetUserId: 1, createdAt: -1 });
reportSchema.index({ status: 1 });

export const Report = mongoose.model('Report', reportSchema);
