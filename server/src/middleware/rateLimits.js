import { ERROR_CODES, LIMITS } from '@chat/shared';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';

const MINUTE = 60 * 1000;

function limiter({
  windowMs,
  limit,
  key,
  skip,
  message = 'Too many attempts. Please try again later.',
}) {
  return rateLimit({
    windowMs,
    limit,
    ...(skip ? { skip } : {}),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: key,
    handler: (_req, _res, next) => next(new AppError(429, ERROR_CODES.RATE_LIMITED, message)),
  });
}

// GET /api/media/:id (mounted at /api, so the path here starts at /media).
const isMediaView = (req) => req.method === 'GET' && /^\/media\/[a-f\d]{24}$/i.test(req.path);

// IPv6 addresses are grouped by /56 subnet so one client can't rotate addresses to bypass limits.
const byIp = (req) => ipKeyGenerator(req.ip);
const byUser = (req) => String(req.auth?.user._id ?? ipKeyGenerator(req.ip));

/**
 * Rate limiters (docs/API.md §4). Created per app instance so tests stay isolated.
 * Memory store: correct for the single-instance v1 deployment (docs/SECURITY.md §8).
 */
export function createRateLimiters() {
  return {
    // Keyed by IP + identifier (body is validated first), plus a looser per-IP cap.
    loginPerAccount: limiter({
      windowMs: 15 * MINUTE,
      limit: 5,
      key: (req) => `${byIp(req)}|${req.body?.identifier ?? ''}`,
      message: 'Too many login attempts. Please wait 15 minutes and try again.',
    }),
    loginPerIp: limiter({ windowMs: 15 * MINUTE, limit: 50, key: byIp }),
    register: limiter({ windowMs: 60 * MINUTE, limit: 5, key: byIp }),
    emailRequestsPerIp: limiter({ windowMs: 60 * MINUTE, limit: 10, key: byIp }),
    emailRequestsPerAddress: limiter({
      windowMs: 60 * MINUTE,
      limit: 3,
      // Requests without a body (e.g. "send the link again") have req.body === undefined.
      key: (req) => String(req.body?.email ?? req.auth?.user.email ?? byIp(req)),
    }),
    tokenLinks: limiter({ windowMs: 15 * MINUTE, limit: 30, key: byIp }),
    sensitive: limiter({ windowMs: 15 * MINUTE, limit: 10, key: byUser }),
    friendRequests: limiter({ windowMs: 24 * 60 * MINUTE, limit: 30, key: byUser }),
    search: limiter({ windowMs: MINUTE, limit: 60, key: byUser }),
    messages: limiter({ windowMs: 10_000, limit: 30, key: byUser }),
    messageActions: limiter({ windowMs: MINUTE, limit: 60, key: byUser }),
    uploads: limiter({
      windowMs: 60 * MINUTE,
      limit: LIMITS.UPLOADS_PER_HOUR,
      key: byUser,
      message: 'Too many uploads. Please try again later.',
    }),
    reports: limiter({ windowMs: 24 * 60 * MINUTE, limit: 10, key: byUser }),
    // Viewing photos/videos has its own limit: an encrypted photo is several requests (preview
    // and parts), so a photo-heavy chat must not use up the general allowance.
    general: limiter({ windowMs: MINUTE, limit: 300, key: byUser, skip: isMediaView }),
    mediaViews: limiter({ windowMs: MINUTE, limit: 1500, key: byUser }),
  };
}
