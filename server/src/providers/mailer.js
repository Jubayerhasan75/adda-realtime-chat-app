import nodemailer from 'nodemailer';

/**
 * @typedef {{ to: string, subject: string, text: string }} Mail
 * @typedef {{ send(mail: Mail): Promise<void>, verify?(): Promise<void>, outbox?: Mail[], devMailbox?: Array<Mail & { sentAt: Date }> }} Mailer
 */

const DEV_MAILBOX_SIZE = 20;

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

  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
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
