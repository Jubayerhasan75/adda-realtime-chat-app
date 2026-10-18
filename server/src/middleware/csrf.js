import { ERROR_CODES } from '@chat/shared';
import { AppError } from '../utils/AppError.js';
import { safeEqual } from '../utils/tokens.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function requestOrigin(req) {
  const origin = req.get('origin');
  if (origin) return origin;
  const referer = req.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

/**
 * Cross-site request forgery protection for state-changing requests (docs/SECURITY.md §3):
 * 1. The Origin (or Referer) must be our own origin. Browsers always send Origin on
 *    POST/PUT/PATCH/DELETE, so a missing value is rejected.
 * 2. With a session, the X-CSRF-Token header must match the session's token, which only
 *    our own pages can read (from GET /api/auth/session).
 * @param {string | ((origin: string | null) => boolean)} allowedOrigin our origin, or a check
 *   from config/origins.js
 */
export function csrfProtection(allowedOrigin) {
  const isAllowed =
    typeof allowedOrigin === 'function' ? allowedOrigin : (origin) => origin === allowedOrigin;
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }
    if (!isAllowed(requestOrigin(req))) {
      next(new AppError(403, ERROR_CODES.ORIGIN_REJECTED, 'Request origin not allowed'));
      return;
    }
    if (req.auth && !safeEqual(req.get('x-csrf-token') ?? '', req.auth.session.csrfToken)) {
      next(
        new AppError(
          403,
          ERROR_CODES.CSRF_FAILED,
          'Security token missing or invalid. Reload the page.',
        ),
      );
      return;
    }
    next();
  };
}
