import { ERROR_CODES } from '@chat/shared';
import { listSessions, revokeAllSessions, revokeSession } from '../services/sessionService.js';
import { toPrivateUser } from '../services/userService.js';
import { recordAudit } from '../services/auditService.js';
import { AppError } from '../utils/AppError.js';
import { requestInfo } from '../utils/requestInfo.js';
import { clearSessionCookie, setSessionCookie } from '../utils/sessionCookie.js';

const services = (req) => req.app.locals.services;

export async function register(req, res) {
  await services(req).auth.register(req.body, requestInfo(req));
  res.status(202).json({
    data: { message: 'Check your email to verify your account, then log in.' },
  });
}

export async function login(req, res) {
  const { user, session, token } = await services(req).auth.login(req.body, requestInfo(req));
  setSessionCookie(req, res, token);
  res.json({ data: { user: toPrivateUser(user), csrfToken: session.csrfToken } });
}

export async function logout(req, res) {
  if (req.auth) await services(req).auth.logout(req.auth, requestInfo(req));
  clearSessionCookie(req, res);
  res.status(204).end();
}

/** App start-up: who is logged in (if anyone) and the CSRF token for later requests. */
export function getSession(req, res) {
  res.json({
    data: {
      user: req.auth ? toPrivateUser(req.auth.user) : null,
      csrfToken: req.auth?.session.csrfToken ?? null,
    },
  });
}

export async function verifyEmail(req, res) {
  await services(req).auth.verifyEmail(req.body.token, requestInfo(req));
  res.json({ data: { message: 'Your email address is verified.' } });
}

export async function resendVerification(req, res) {
  await services(req).auth.resendVerification(req.auth.user);
  res
    .status(202)
    .json({ data: { message: 'If your email isn’t verified yet, a new link is on its way.' } });
}

export async function forgotPassword(req, res) {
  await services(req).auth.forgotPassword(req.body.email);
  res.status(202).json({
    data: { message: 'If an account uses this email, a reset link is on its way.' },
  });
}

export async function resetPassword(req, res) {
  await services(req).auth.resetPassword(req.body, requestInfo(req));
  clearSessionCookie(req, res);
  res.json({ data: { message: 'Your password was changed. Please log in again.' } });
}

export async function changePassword(req, res) {
  const { session, token } = await services(req).auth.changePassword(
    req.auth,
    req.body,
    requestInfo(req),
  );
  setSessionCookie(req, res, token);
  res.json({ data: { user: toPrivateUser(req.auth.user), csrfToken: session.csrfToken } });
}

export async function requestEmailChange(req, res) {
  await services(req).auth.requestEmailChange(req.auth.user, req.body);
  res.status(202).json({
    data: { message: 'Check the new address for a confirmation link.' },
  });
}

export async function confirmEmailChange(req, res) {
  await services(req).auth.confirmEmailChange(req.body.token, requestInfo(req));
  res.json({ data: { message: 'Your email address was changed.' } });
}

export async function getSessions(req, res) {
  res.json({ data: await listSessions(req.auth.user._id, req.auth.session._id) });
}

export async function deleteSession(req, res) {
  const { user, session } = req.auth;
  if (!(await revokeSession(user._id, req.params.sessionId))) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Session not found');
  }
  await recordAudit(req.log, 'session_revoked', {
    userId: user._id,
    sessionId: req.params.sessionId,
    ...requestInfo(req),
  });
  if (req.params.sessionId === session.id) clearSessionCookie(req, res);
  res.status(204).end();
}

export async function deleteOtherSessions(req, res) {
  const { user, session } = req.auth;
  await revokeAllSessions(user._id, { exceptSessionId: session._id });
  await recordAudit(req.log, 'session_revoked', {
    userId: user._id,
    sessionId: session._id,
    ...requestInfo(req),
  });
  res.status(204).end();
}
