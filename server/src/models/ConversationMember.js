import mongoose from 'mongoose';
import { CHAT_ACCENTS } from '@chat/shared';

const { Schema } = mongoose;

/**
 * One user's view of a conversation (docs/DATABASE.md §2.7). Its existence is the single proof
 * that the user may access the conversation. Receipts are watermarks: "everything up to seq N
 * was delivered / read". They only ever move forward.
 */
const memberSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Direct chats: the other person. Groups: null (see `role`).
    peerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    role: { type: String, enum: ['admin', 'member', null], default: null },
    lastMessageAt: { type: Date, default: null },
    deliveredUpToSeq: { type: Number, default: 0 },
    readUpToSeq: { type: Number, default: 0 },
    // "Clear chat": messages up to this seq are hidden for this user only.
    clearedUpToSeq: { type: Number, default: 0 },
    // No notifications until this time (a far-future date = until unmuted). Used in Phase 9.
    mutedUntil: { type: Date, default: null },
    // This user's color for this chat only (preset name, see CHAT_ACCENTS); null = default.
    accent: { type: String, enum: CHAT_ACCENTS, default: null },
  },
  { timestamps: true },
);

memberSchema.index({ conversationId: 1, userId: 1 }, { unique: true });
memberSchema.index({ userId: 1, lastMessageAt: -1 });

export const ConversationMember = mongoose.model('ConversationMember', memberSchema);
