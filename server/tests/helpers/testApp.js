import mongoose from 'mongoose';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';

// Set TEST_LOG_LEVEL=error to see server errors while debugging tests.
export const silentLogger = pino({ level: process.env.TEST_LOG_LEVEL ?? 'silent' });
export const ORIGIN = 'http://localhost:5173';
export const PASSWORD = 'purple-river-lamp-42';

/**
 * @param {Record<string, string>} [overrides] environment overrides
 * @param {{ pushSender?: Function }} [deps] fakes for outside services
 */
export function createTestApp(overrides = {}, deps = {}) {
  const env = loadEnv({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/unused',
    APP_ORIGIN: ORIGIN,
    // Point at a directory without a build so tests exercise the API alone unless they opt in.
    CLIENT_DIST_DIR: 'tests/fixtures/no-client-build',
    ...overrides,
  });
  return createApp({ env, logger: silentLogger, ...deps });
}

/** A cookie-keeping client that behaves like our own web page (sends our Origin). */
export function browserAgent(app) {
  return request.agent(app).set('Origin', ORIGIN);
}

/** Emails captured by the in-memory mail transport. */
export const outbox = (app) => app.locals.mailer.outbox;

/** Extracts the one-time token from the most recent email to `to`. */
export function lastEmailToken(app, to) {
  const mail = outbox(app).findLast((item) => item.to === to);
  const match = /token=([A-Za-z0-9_-]{43})/.exec(mail?.text ?? '');
  if (!match) throw new Error(`No token email found for ${to}`);
  return match[1];
}

export async function clearDatabase() {
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

/**
 * Registers, verifies and logs in a user through the real API.
 * @returns {Promise<{ agent: import('supertest').Agent, csrfToken: string, user: object, email: string }>}
 */
export async function createVerifiedUser(
  app,
  { username = 'nadia', email, displayName = 'Nadia' } = {},
) {
  const address = email ?? `${username}@example.com`;
  const agent = browserAgent(app);

  await agent
    .post('/api/auth/register')
    .send({ email: address, username, displayName, password: PASSWORD })
    .expect(202);
  await agent
    .post('/api/auth/verify-email')
    .send({ token: lastEmailToken(app, address) })
    .expect(200);
  const login = await agent
    .post('/api/auth/login')
    .send({ identifier: username, password: PASSWORD })
    .expect(200);

  const cookie = login.headers['set-cookie'].find((c) => c.startsWith('sid=')).split(';')[0];
  return {
    agent,
    cookie,
    csrfToken: login.body.data.csrfToken,
    user: login.body.data.user,
    email: address,
  };
}

/**
 * An envelope-shaped stand-in for an end-to-end encrypted message (docs/E2EE.md §3). The
 * server can't read envelopes anyway, so tests put a recognizable label in the "ciphertext".
 */
export function fakeEnvelope(label = 'x') {
  return {
    v: 1,
    sk: 'A'.repeat(22),
    rk: 'B'.repeat(22),
    iv: 'C'.repeat(16),
    ct: Buffer.from(`sealed:${label}`.padEnd(16, '.')).toString('base64url'),
  };
}

/** The label inside a fakeEnvelope (null for none). */
export function envelopeLabel(envelope) {
  if (!envelope) return null;
  return Buffer.from(envelope.ct, 'base64url')
    .toString()
    .replace(/^sealed:/, '')
    .replace(/\.+$/, '');
}
