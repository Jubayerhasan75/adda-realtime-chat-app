import { Router } from 'express';
import {
  changeEmailSchema,
  changePasswordSchema,
  emailTokenSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '@chat/shared';
import * as auth from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

/** @param {ReturnType<import('../middleware/rateLimits.js').createRateLimiters>} limits */
export function createAuthRouter(limits) {
  const router = Router();

  router.get('/session', auth.getSession);
  router.post('/register', limits.register, validateBody(registerSchema), auth.register);
  router.post(
    '/login',
    limits.loginPerIp,
    validateBody(loginSchema),
    limits.loginPerAccount,
    auth.login,
  );
  router.post('/logout', auth.logout);

  router.post('/verify-email', limits.tokenLinks, validateBody(emailTokenSchema), auth.verifyEmail);
  router.post(
    '/resend-verification',
    requireAuth,
    limits.emailRequestsPerAddress,
    auth.resendVerification,
  );
  router.post(
    '/forgot-password',
    limits.emailRequestsPerIp,
    validateBody(forgotPasswordSchema),
    limits.emailRequestsPerAddress,
    auth.forgotPassword,
  );
  router.post(
    '/reset-password',
    limits.tokenLinks,
    validateBody(resetPasswordSchema),
    auth.resetPassword,
  );

  router.post(
    '/change-password',
    requireAuth,
    limits.sensitive,
    validateBody(changePasswordSchema),
    auth.changePassword,
  );
  router.post(
    '/change-email',
    requireAuth,
    limits.sensitive,
    validateBody(changeEmailSchema),
    auth.requestEmailChange,
  );
  router.post(
    '/confirm-email-change',
    limits.tokenLinks,
    validateBody(emailTokenSchema),
    auth.confirmEmailChange,
  );

  router.get('/sessions', requireAuth, auth.getSessions);
  router.delete('/sessions/:sessionId', requireAuth, auth.deleteSession);
  router.delete('/sessions', requireAuth, auth.deleteOtherSessions);

  return router;
}
