import { AuditEvent } from '../models/AuditEvent.js';

/**
 * Records a security event. Auditing must never break the action being audited, so failures
 * are logged and swallowed.
 * @param {import('pino').Logger} logger
 * @param {string} type one of AUDIT_EVENT_TYPES
 * @param {{ userId: unknown, sessionId?: unknown, ipPrefix?: string, userAgent?: string }} data
 */
export async function recordAudit(logger, type, data) {
  try {
    await AuditEvent.create({ type, ...data });
    await auditHook?.({ type, ...data });
  } catch (err) {
    logger.error({ err, type }, 'Failed to record audit event');
  }
}

// Turns some events into security alerts in the user's notification feed (set by app.js).
let auditHook = null;
export function onAuditRecorded(hook) {
  auditHook = hook;
}
