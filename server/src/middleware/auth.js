import { ERROR_CODES } from '@chat/shared';
import { resolveSession } from '../services/sessionService.js';
import { AppError } from '../utils/AppError.js';

/**
 * Reads the session cookie and attaches `req.auth = { user, session }` (or null).
 * A stale or invalid cookie is cleared so the browser stops sending it.
 * @param {{ name: string, options: import('express').CookieOptions }} cookie
 */
export function loadSession(cookie) {
  return async (req, res, next) => {
    const token = req.cookies?.[cookie.name];
    req.auth = token ? await resolveSession(token) : null;
    if (token && !req.auth) {
      const { maxAge, ...clearOptions } = cookie.options;
      res.clearCookie(cookie.name, clearOptions);
    }
    next();
  };
}

/** @type {import('express').RequestHandler} */
export function requireAuth(req, _res, next) {
  if (!req.auth) {
    next(new AppError(401, ERROR_CODES.UNAUTHENTICATED, 'Please log in to continue'));
    return;
  }
  next();
}

/** Social and messaging features require a verified email (docs/REQUIREMENTS.md D2). */
export function requireVerified(req, _res, next) {
  if (!req.auth) {
    next(new AppError(401, ERROR_CODES.UNAUTHENTICATED, 'Please log in to continue'));
    return;
  }
  if (!req.auth.user.emailVerifiedAt) {
    next(new AppError(403, ERROR_CODES.EMAIL_NOT_VERIFIED, 'Verify your email address first'));
    return;
  }
  next();
}
