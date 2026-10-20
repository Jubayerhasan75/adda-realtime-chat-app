import nodemailer from 'nodemailer';

/**
 * @typedef {{ to: string, subject: string, text: string }} Mail
 * @typedef {{ send(mail: Mail): Promise<void>, verify?(): Promise<void>, outbox?: Mail[], devMailbox?: Array<Mail & { sentAt: Date }> }} Mailer
 */

const DEV_MAILBOX_SIZE = 20;
const SEND_TIMEOUT_MS = 10_000;
const BREVO_API = 'https://api.brevo.com/v3';

/** "Adda <no-reply@example.com>" → { name: 'Adda', email: 'no-reply@example.com' }. */
export function parseSender(from) {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return match ? { name: match[1] || undefined, email: match[2] } : { email: from.trim() };
}

/**
 * Brevo's HTTPS API (port 443): works where SMTP ports are blocked. The sender address must
 * be verified in Brevo (Senders & IPs). The API key never appears in logs or errors.
 */
function createBrevoMailer(env, logger) {
  const call = async (path, init = {}) => {
    const response = await fetch(`${BREVO_API}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': env.BREVO_API_KEY,
      },
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(`Brevo ${path} failed: ${response.status} ${detail.message ?? ''}`.trim());
    }
    return response;
  };
  return {
    /** Checks the API key at start-up. */
    async verify() {
      await call('/account');
    },
    async send(mail) {
      await call('/smtp/email', {
        method: 'POST',
        body: JSON.stringify({
          sender: parseSender(env.MAIL_FROM),
          to: [{ email: mail.to }],
          subject: mail.subject,
          textContent: mail.text,
        }),
      });
      logger.info({ subject: mail.subject }, 'Email sent');
    },
  };
}

/**
 * Creates the configured mail transport.
 * - smtp: real delivery (Brevo, Gmail, …)
 * - console: development only — prints the email to the server terminal and keeps the last
 *   few in `devMailbox`, readable at /dev/mailbox in the app
 * - memory: automated tests only — keeps emails in `outbox` so tests can read the links
 * @param {import('../config/env.js').Env} env
 * @param {import('pino').Logger} logger
 * @returns {Mailer}
 */
export function createMailer(env, logger) {
  if (env.MAIL_TRANSPORT === 'memory') {
    const outbox = [];
    return {
      outbox,
      async send(mail) {
        outbox.push(mail);
      },
    };
  }

  if (env.MAIL_TRANSPORT === 'console') {
    const devMailbox = [];
    return {
      devMailbox,
      async send(mail) {
        // Development convenience: never enabled in production (enforced in env.js).
        devMailbox.unshift({ ...mail, sentAt: new Date() });
        devMailbox.length = Math.min(devMailbox.length, DEV_MAILBOX_SIZE);
        // eslint-disable-next-line no-console -- printing the email is this transport's job
        console.info(
          `\n──── DEV EMAIL (not sent — open http://localhost:5173/dev/mailbox) ────\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n──────────────────────────────\n`,
        );
      },
    };
  }

  if (env.MAIL_TRANSPORT === 'brevo') return createBrevoMailer(env, logger);

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    // Never let a blocked or slow mail server hold up sign-up for minutes.
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });
  return {
    /** Checks the SMTP login so misconfiguration is reported at start-up, not at first sign-up. */
    async verify() {
      await transport.verify();
    },
    async send(mail) {
      await transport.sendMail({ from: env.MAIL_FROM, ...mail });
      logger.info({ subject: mail.subject }, 'Email sent');
    },
  };
}
