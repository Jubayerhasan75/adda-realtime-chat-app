import { SESSION_ABSOLUTE_MS } from '../config/security.js';

/**
 * Session cookie settings (docs/SECURITY.md §4). Over HTTPS the `__Host-` prefix forces
 * Secure, Path=/ and no Domain, so the cookie can't be set or read by other subdomains.
 * @param {import('../config/env.js').Env} env
 */
export function sessionCookieConfig(env) {
  const secure = env.APP_ORIGIN.startsWith('https://');
  return {
    name: secure ? '__Host-sid' : 'sid',
    options: {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_ABSOLUTE_MS,
    },
  };
}

export function setSessionCookie(req, res, token) {
  const { name, options } = req.app.locals.sessionCookie;
  res.cookie(name, token, options);
}

export function clearSessionCookie(req, res) {
  const { name, options } = req.app.locals.sessionCookie;
  const { maxAge, ...clearOptions } = options;
  res.clearCookie(name, clearOptions);
}
