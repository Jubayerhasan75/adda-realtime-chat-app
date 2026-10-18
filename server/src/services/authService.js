import { ERROR_CODES, passwordContainsIdentity } from '@chat/shared';
import { TOKEN_LIFETIME_MS } from '../config/security.js';
import { AuthToken } from '../models/AuthToken.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../utils/passwords.js';
import { generateToken, hashToken } from '../utils/tokens.js';
import { recordAudit } from './auditService.js';
import {
  accountExistsMail,
  confirmEmailChangeMail,
  emailChangeRequestedNotice,
  passwordChangedNotice,
  passwordResetMail,
  verifyEmailMail,
} from './emailTemplates.js';
import { createSession, revokeAllSessions, revokeSession } from './sessionService.js';

const DUPLICATE_KEY = 11000;

const invalidToken = () =>
  new AppError(400, ERROR_CODES.INVALID_TOKEN, 'This link is invalid or has expired');

const wrongPassword = (field) =>
  new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'Incorrect password', [
    { path: field, issue: 'Incorrect password' },
  ]);

const identityInPassword = (field) =>
  new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'Choose a different password', [
    { path: field, issue: 'Your password must not contain your username or email' },
  ]);

/**
 * Account lifecycle: registration, login, email verification, password and email changes.
 * @param {{ env: import('../config/env.js').Env, mailer: import('../providers/mailer.js').Mailer, logger: import('pino').Logger }} deps
 */
export function createAuthService({ env, mailer, logger }) {
  const link = (path, token) => `${env.APP_ORIGIN}${path}?token=${token}`;

  /** Email failures must not fail the request (the user can resend); they are logged instead. */
  async function sendMail(to, mail) {
    try {
      await mailer.send({ to, ...mail });
    } catch (err) {
      logger.error({ err, subject: mail.subject }, 'Failed to send email');
    }
  }

  async function issueToken(userId, type, extra = {}) {
    await AuthToken.deleteMany({ userId, type, usedAt: null });
    const token = generateToken();
    await AuthToken.create({
      userId,
      type,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS[type]),
      ...extra,
    });
    return token;
  }

  function findValidToken(token, type) {
    return AuthToken.findOne({
      tokenHash: hashToken(token),
      type,
      usedAt: null,
      expiresAt: { $gt: new Date() },
    });
  }

  /** Atomically marks a token as used; returns null if it was used concurrently. */
  function consumeToken(tokenDoc) {
    return AuthToken.findOneAndUpdate(
      { _id: tokenDoc._id, usedAt: null },
      { $set: { usedAt: new Date() } },
    );
  }

  async function sendVerification(user) {
    const token = await issueToken(user._id, 'verify_email');
    await sendMail(
      user.email,
      verifyEmailMail({ displayName: user.displayName, link: link('/verify-email', token) }),
    );
  }

  return {
    /**
     * Creates an account. If the email is already registered nothing is created and the owner
     * is notified by email; the response is identical either way (no account enumeration).
     */
    async register({ email, username, displayName, password }, client) {
      // Hash first in every path so response timing doesn't reveal which path ran.
      const passwordHash = await hashPassword(password);

      if (await User.exists({ username })) {
        throw new AppError(409, ERROR_CODES.USERNAME_TAKEN, 'This username is already taken');
      }
      if (await User.exists({ email })) {
        await sendMail(
          email,
          accountExistsMail({
            loginLink: `${env.APP_ORIGIN}/login`,
            resetLink: `${env.APP_ORIGIN}/forgot-password`,
          }),
        );
        return;
      }

      let user;
      try {
        user = await User.create({ email, username, displayName, passwordHash });
      } catch (err) {
        if (err.code !== DUPLICATE_KEY) throw err;
        if (err.keyPattern?.username) {
          throw new AppError(409, ERROR_CODES.USERNAME_TAKEN, 'This username is already taken');
        }
        return; // email registered concurrently: same silent outcome as above
      }
      await recordAudit(logger, 'register', { userId: user._id, ...client });
      await sendVerification(user);
    },

    async login({ identifier, password }, client) {
      const field = identifier.includes('@') ? 'email' : 'username';
      const user = await User.findOne({ [field]: identifier, status: 'active' }).select(
        '+passwordHash',
      );

      if (!user) {
        await verifyAgainstDummy(password);
        throw new AppError(
          401,
          ERROR_CODES.INVALID_CREDENTIALS,
          'Incorrect email/username or password',
        );
      }
      if (!(await verifyPassword(user.passwordHash, password))) {
        await recordAudit(logger, 'login_failed', { userId: user._id, ...client });
        throw new AppError(
          401,
          ERROR_CODES.INVALID_CREDENTIALS,
          'Incorrect email/username or password',
        );
      }

      const { session, token } = await createSession(user._id, client);
      await recordAudit(logger, 'login', { userId: user._id, sessionId: session._id, ...client });
      return { user, session, token };
    },

    async logout({ user, session }, client) {
      await revokeSession(user._id, session._id);
      await recordAudit(logger, 'logout', { userId: user._id, sessionId: session._id, ...client });
    },

    async verifyEmail(token, client) {
      const tokenDoc = await findValidToken(token, 'verify_email');
      if (!tokenDoc || !(await consumeToken(tokenDoc))) throw invalidToken();

      await User.updateOne(
        { _id: tokenDoc.userId, emailVerifiedAt: null },
        { $set: { emailVerifiedAt: new Date() } },
      );
      await recordAudit(logger, 'email_verified', { userId: tokenDoc.userId, ...client });
    },

    async resendVerification(user) {
      if (user.emailVerifiedAt) return;
      await sendVerification(user);
    },

    /** Always succeeds from the caller's point of view (no account enumeration). */
    async forgotPassword(email) {
      const user = await User.findOne({ email, status: 'active' });
      if (!user) return;
      const token = await issueToken(user._id, 'reset_password');
      await sendMail(user.email, passwordResetMail({ link: link('/reset-password', token) }));
    },

    async resetPassword({ token, newPassword }, client) {
      const tokenDoc = await findValidToken(token, 'reset_password');
      if (!tokenDoc) throw invalidToken();
      const user = await User.findOne({ _id: tokenDoc.userId, status: 'active' });
      if (!user) throw invalidToken();
      if (passwordContainsIdentity(newPassword, user)) throw identityInPassword('newPassword');
      if (!(await consumeToken(tokenDoc))) throw invalidToken();

      user.passwordHash = await hashPassword(newPassword);
      // Receiving the reset email proves the user controls this address.
      user.emailVerifiedAt ??= new Date();
      await user.save();
      await revokeAllSessions(user._id);
      await recordAudit(logger, 'password_reset', { userId: user._id, ...client });
    },

    /**
     * Changes the password, signs out every other device and rotates the current session.
     * @returns {Promise<{ session: object, token: string }>} the replacement session
     */
    async changePassword({ user, session }, { currentPassword, newPassword }, client) {
      const withHash = await User.findById(user._id).select('+passwordHash');
      if (!(await verifyPassword(withHash.passwordHash, currentPassword))) {
        throw wrongPassword('currentPassword');
      }
      if (passwordContainsIdentity(newPassword, user)) throw identityInPassword('newPassword');

      withHash.passwordHash = await hashPassword(newPassword);
      await withHash.save();
      await revokeAllSessions(user._id);
      const replacement = await createSession(user._id, client);

      await recordAudit(logger, 'password_changed', {
        userId: user._id,
        sessionId: session._id,
        ...client,
      });
      await sendMail(user.email, passwordChangedNotice({ displayName: user.displayName }));
      return replacement;
    },

    /** Starts an email change; the new address must be confirmed through its own link. */
    async requestEmailChange(user, { newEmail, password }) {
      const withHash = await User.findById(user._id).select('+passwordHash');
      if (!(await verifyPassword(withHash.passwordHash, password))) throw wrongPassword('password');
      if (newEmail === user.email) {
        throw new AppError(400, ERROR_CODES.VALIDATION_FAILED, 'This is already your email', [
          { path: 'newEmail', issue: 'This is already your email' },
        ]);
      }
      // If another account uses the address, quietly do nothing (no enumeration); the
      // uniqueness is enforced again when the link is confirmed.
      if (await User.exists({ email: newEmail })) return;

      const token = await issueToken(user._id, 'change_email', { newEmail });
      await sendMail(
        newEmail,
        confirmEmailChangeMail({
          displayName: user.displayName,
          link: link('/confirm-email', token),
        }),
      );
      await sendMail(
        user.email,
        emailChangeRequestedNotice({ displayName: user.displayName, newEmail }),
      );
    },

    async confirmEmailChange(token, client) {
      const tokenDoc = await findValidToken(token, 'change_email');
      if (!tokenDoc || !(await consumeToken(tokenDoc))) throw invalidToken();

      try {
        const result = await User.updateOne(
          { _id: tokenDoc.userId, status: 'active' },
          { $set: { email: tokenDoc.newEmail, emailVerifiedAt: new Date() } },
        );
        if (result.matchedCount === 0) throw invalidToken();
      } catch (err) {
        if (err.code !== DUPLICATE_KEY) throw err;
        throw new AppError(409, ERROR_CODES.INVALID_STATE, 'This email address is already in use');
      }
      await recordAudit(logger, 'email_changed', { userId: tokenDoc.userId, ...client });
    },
  };
}
