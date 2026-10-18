import mongoose from 'mongoose';

const { Schema } = mongoose;

export const AUDIT_EVENT_TYPES = [
  'register',
  'login',
  'login_failed',
  'logout',
  'email_verified',
  'password_changed',
  'password_reset',
  'email_changed',
  'username_changed',
  'session_revoked',
  'account_deleted',
  'encryption_reset',
];

const RETENTION_SECONDS = 180 * 24 * 60 * 60;

/** Security-relevant account events. Never contains passwords, tokens or message content. */
const auditEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: AUDIT_EVENT_TYPES, required: true },
    sessionId: { type: Schema.Types.ObjectId, default: null },
    ipPrefix: { type: String, default: '' },
    userAgent: { type: String, maxlength: 200, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditEventSchema.index({ userId: 1, createdAt: -1 });
auditEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });

export const AuditEvent = mongoose.model('AuditEvent', auditEventSchema);
