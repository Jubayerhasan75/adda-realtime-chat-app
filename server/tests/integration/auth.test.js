import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Session } from '../../src/models/Session.js';
import { User } from '../../src/models/User.js';
import {
  ORIGIN,
  PASSWORD,
  browserAgent,
  clearDatabase,
  createTestApp,
  createVerifiedUser,
  lastEmailToken,
  outbox,
  silentLogger,
} from '../helpers/testApp.js';
import { startTestDatabase } from '../helpers/testDatabase.js';

let database;
let app;

beforeAll(async () => {
  database = await startTestDatabase(silentLogger);
});

afterAll(async () => {
  await database?.stop();
});

beforeEach(async () => {
  await clearDatabase();
  app = createTestApp(); // fresh rate limiters and mail outbox for every test
});

const registration = (overrides = {}) => ({
  email: 'nadia@example.com',
  username: 'nadia',
  displayName: 'Nadia',
  password: PASSWORD,
  ...overrides,
});

const sessionCookieOf = (res) => res.headers['set-cookie']?.find((c) => c.startsWith('sid='));

describe('registration', () => {
  it('creates an unverified account, hashes the password and emails a verification link', async () => {
    const res = await browserAgent(app).post('/api/auth/register').send(registration()).expect(202);

    expect(res.body.data.message).toMatch(/check your email/i);
    expect(sessionCookieOf(res)).toBeUndefined();

    const user = await User.findOne({ username: 'nadia' }).select('+passwordHash');
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);

    const [mail] = outbox(app);
    expect(mail.to).toBe('nadia@example.com');
    expect(mail.text).toContain(`${ORIGIN}/verify-email?token=`);
  });

  it('gives the same response for an already-registered email and creates nothing', async () => {
    const agent = browserAgent(app);
    const first = await agent.post('/api/auth/register').send(registration()).expect(202);
    const second = await agent
      .post('/api/auth/register')
      .send(registration({ username: 'someone_else' }))
      .expect(202);

    expect(second.body).toEqual(first.body);
    expect(await User.countDocuments()).toBe(1);
    expect(outbox(app).at(-1).subject).toMatch(/tried to sign up/i);
  });

  it('rejects a taken username', async () => {
    const agent = browserAgent(app);
    await agent.post('/api/auth/register').send(registration()).expect(202);
    const res = await agent
      .post('/api/auth/register')
      .send(registration({ email: 'other@example.com', username: 'NADIA' }))
      .expect(409);

    expect(res.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('creates exactly one account when two sign-ups race for the same username', async () => {
    const [first, second] = await Promise.all([
      browserAgent(app)
        .post('/api/auth/register')
        .send(registration({ email: 'a@example.com' })),
      browserAgent(app)
        .post('/api/auth/register')
        .send(registration({ email: 'b@example.com' })),
    ]);

    expect([first.status, second.status].sort()).toEqual([202, 409]);
    expect(await User.countDocuments({ username: 'nadia' })).toBe(1);
  });

  it('returns field-level validation errors and rejects unknown fields', async () => {
    const res = await browserAgent(app)
      .post('/api/auth/register')
      .send({ ...registration({ username: 'a', password: 'short' }), isAdmin: true })
      .expect(400);

    const paths = res.body.error.details.map((detail) => detail.path);
    expect(paths).toEqual(expect.arrayContaining(['username', 'password', '']));
  });
});

describe('login and sessions', () => {
  beforeEach(async () => {
    await browserAgent(app).post('/api/auth/register').send(registration()).expect(202);
  });

  it('answers identically for an unknown user and a wrong password', async () => {
    const agent = browserAgent(app);
    const unknown = await agent
      .post('/api/auth/login')
      .send({ identifier: 'ghost@example.com', password: PASSWORD })
      .expect(401);
    const wrong = await agent
      .post('/api/auth/login')
      .send({ identifier: 'nadia', password: 'wrong-password-123' })
      .expect(401);

    const strip = ({ error: { requestId: _id, ...rest } }) => rest;
    expect(strip(wrong.body)).toEqual(strip(unknown.body));
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('sets an HttpOnly, SameSite=Lax session cookie and accepts email or username', async () => {
    const res = await browserAgent(app)
      .post('/api/auth/login')
      .send({ identifier: 'NADIA@example.com', password: PASSWORD })
      .expect(200);

    const cookie = sessionCookieOf(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(res.body.data.user).toMatchObject({ username: 'nadia', emailVerified: false });
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('keeps the user signed in across requests (page refresh)', async () => {
    const agent = browserAgent(app);
    await agent.post('/api/auth/login').send({ identifier: 'nadia', password: PASSWORD });

    const res = await agent.get('/api/auth/session').expect(200);

    expect(res.body.data.user.username).toBe('nadia');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('logs out, clears the cookie and refuses to reuse the old token', async () => {
    const agent = browserAgent(app);
    const login = await agent
      .post('/api/auth/login')
      .send({ identifier: 'nadia', password: PASSWORD });
    const oldCookie = sessionCookieOf(login).split(';')[0];

    await agent.post('/api/auth/logout').set('X-CSRF-Token', login.body.data.csrfToken).expect(204);

    const replay = await request(app).get('/api/auth/session').set('Cookie', oldCookie).expect(200);
    expect(replay.body.data.user).toBeNull();
    expect(await Session.countDocuments({ revokedAt: null })).toBe(0);
  });

  it('ends sessions that have been idle too long', async () => {
    const agent = browserAgent(app);
    await agent.post('/api/auth/login').send({ identifier: 'nadia', password: PASSWORD });
    await Session.updateMany({}, { $set: { idleExpiresAt: new Date(Date.now() - 1000) } });

    const res = await agent.get('/api/auth/session').expect(200);

    expect(res.body.data.user).toBeNull();
    expect(res.headers['set-cookie']?.join()).toMatch(/sid=;/);
  });

  it('rate-limits repeated failed logins for one account', async () => {
    const agent = browserAgent(app);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await agent.post('/api/auth/login').send({ identifier: 'nadia', password: 'nope-nope-nope' });
    }
    const res = await agent
      .post('/api/auth/login')
      .send({ identifier: 'nadia', password: PASSWORD })
      .expect(429);

    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['ratelimit-policy'] ?? res.headers.ratelimit).toBeDefined();
  });
});

describe('CSRF and origin protection', () => {
  it('rejects state changes from another origin or without an origin', async () => {
    await request(app)
      .post('/api/auth/register')
      .set('Origin', 'https://evil.example')
      .send(registration())
      .expect(403);
    const res = await request(app).post('/api/auth/register').send(registration()).expect(403);

    expect(res.body.error.code).toBe('ORIGIN_REJECTED');
    expect(await User.countDocuments()).toBe(0);
  });

  it('requires the session CSRF token for authenticated changes', async () => {
    const { agent, csrfToken } = await createVerifiedUser(app);

    const missing = await agent.patch('/api/users/me').send({ bio: 'hi' }).expect(403);
    expect(missing.body.error.code).toBe('CSRF_FAILED');
    await agent
      .patch('/api/users/me')
      .set('X-CSRF-Token', 'x'.repeat(43))
      .send({ bio: 'hi' })
      .expect(403);
    await agent
      .patch('/api/users/me')
      .set('X-CSRF-Token', csrfToken)
      .send({ bio: 'hi' })
      .expect(200);
  });
});

describe('email verification', () => {
  it('verifies once and rejects reused or invalid links', async () => {
    const agent = browserAgent(app);
    await agent.post('/api/auth/register').send(registration()).expect(202);
    const token = lastEmailToken(app, 'nadia@example.com');

    await agent.post('/api/auth/verify-email').send({ token }).expect(200);
    const reused = await agent.post('/api/auth/verify-email').send({ token }).expect(400);
    await agent
      .post('/api/auth/verify-email')
      .send({ token: 'a'.repeat(43) })
      .expect(400);

    expect(reused.body.error.code).toBe('INVALID_TOKEN');
    expect((await User.findOne({ username: 'nadia' })).emailVerifiedAt).toBeInstanceOf(Date);
  });
});

describe('resend verification', () => {
  it('sends a fresh link to a signed-in unverified user (request has no body)', async () => {
    const agent = browserAgent(app);
    await agent.post('/api/auth/register').send(registration()).expect(202);
    const login = await agent
      .post('/api/auth/login')
      .send({ identifier: 'nadia', password: PASSWORD })
      .expect(200);
    const firstToken = lastEmailToken(app, 'nadia@example.com');

    await agent
      .post('/api/auth/resend-verification')
      .set('X-CSRF-Token', login.body.data.csrfToken)
      .expect(202);

    const newToken = lastEmailToken(app, 'nadia@example.com');
    expect(newToken).not.toBe(firstToken);
    const csrf = login.body.data.csrfToken;
    await agent
      .post('/api/auth/verify-email')
      .set('X-CSRF-Token', csrf)
      .send({ token: firstToken })
      .expect(400);
    await agent
      .post('/api/auth/verify-email')
      .set('X-CSRF-Token', csrf)
      .send({ token: newToken })
      .expect(200);
  });
});

describe('password reset', () => {
  it('does not reveal whether an email is registered', async () => {
    const res = await browserAgent(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' })
      .expect(202);

    expect(res.body.data.message).toMatch(/if an account/i);
    expect(outbox(app)).toHaveLength(0);
  });

  it('resets the password, signs out every device, and the link works only once', async () => {
    const { agent: oldDevice } = await createVerifiedUser(app);
    const resetter = browserAgent(app);
    await resetter
      .post('/api/auth/forgot-password')
      .send({ email: 'nadia@example.com' })
      .expect(202);
    const token = lastEmailToken(app, 'nadia@example.com');
    const newPassword = 'green-mountain-tea-77';

    await resetter.post('/api/auth/reset-password').send({ token, newPassword }).expect(200);

    expect((await oldDevice.get('/api/auth/session')).body.data.user).toBeNull();
    await resetter.post('/api/auth/reset-password').send({ token, newPassword }).expect(400);
    await resetter
      .post('/api/auth/login')
      .send({ identifier: 'nadia', password: PASSWORD })
      .expect(401);
    await resetter
      .post('/api/auth/login')
      .send({ identifier: 'nadia', password: newPassword })
      .expect(200);
  });
});

describe('authenticated account changes', () => {
  it('changes the password: wrong current password is a field error; success signs out other devices', async () => {
    const { agent, csrfToken } = await createVerifiedUser(app);
    const otherDevice = browserAgent(app);
    await otherDevice.post('/api/auth/login').send({ identifier: 'nadia', password: PASSWORD });

    const wrong = await agent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', csrfToken)
      .send({ currentPassword: 'not-my-password', newPassword: 'green-mountain-tea-77' })
      .expect(400);
    expect(wrong.body.error.details[0].path).toBe('currentPassword');

    const res = await agent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', csrfToken)
      .send({ currentPassword: PASSWORD, newPassword: 'green-mountain-tea-77' })
      .expect(200);

    expect((await otherDevice.get('/api/auth/session')).body.data.user).toBeNull();
    const current = await agent.get('/api/auth/session').expect(200);
    expect(current.body.data.user.username).toBe('nadia');
    expect(current.body.data.csrfToken).toBe(res.body.data.csrfToken);
    expect(outbox(app).at(-1).subject).toMatch(/password was changed/i);
  });

  it('changes the email only after the new address is confirmed', async () => {
    const { agent, csrfToken } = await createVerifiedUser(app);

    await agent
      .post('/api/auth/change-email')
      .set('X-CSRF-Token', csrfToken)
      .send({ newEmail: 'nadia.new@example.com', password: PASSWORD })
      .expect(202);
    expect((await agent.get('/api/users/me')).body.data.email).toBe('nadia@example.com');
    expect(
      outbox(app).some(
        (mail) => mail.to === 'nadia@example.com' && /being changed/.test(mail.subject),
      ),
    ).toBe(true);

    await agent
      .post('/api/auth/confirm-email-change')
      .set('X-CSRF-Token', csrfToken)
      .send({ token: lastEmailToken(app, 'nadia.new@example.com') })
      .expect(200);

    expect((await agent.get('/api/users/me')).body.data.email).toBe('nadia.new@example.com');
  });

  it('lists sessions and only lets users revoke their own', async () => {
    const nadia = await createVerifiedUser(app);
    const arif = await createVerifiedUser(app, { username: 'arif' });
    await browserAgent(app)
      .post('/api/auth/login')
      .send({ identifier: 'nadia', password: PASSWORD });

    const list = await nadia.agent.get('/api/auth/sessions').expect(200);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data.filter((s) => s.current)).toHaveLength(1);
    const other = list.body.data.find((s) => !s.current);

    // Arif cannot revoke Nadia's session (IDOR), and malformed ids are a clean 404.
    await arif.agent
      .delete(`/api/auth/sessions/${other.id}`)
      .set('X-CSRF-Token', arif.csrfToken)
      .expect(404);
    await nadia.agent
      .delete('/api/auth/sessions/not-an-id')
      .set('X-CSRF-Token', nadia.csrfToken)
      .expect(404);

    await nadia.agent
      .delete(`/api/auth/sessions/${other.id}`)
      .set('X-CSRF-Token', nadia.csrfToken)
      .expect(204);
    expect((await nadia.agent.get('/api/auth/sessions')).body.data).toHaveLength(1);
  });
});

describe('profile, username and settings', () => {
  it('requires login', async () => {
    const res = await request(app).get('/api/users/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('cleans profile text and enforces the username cooldown and uniqueness', async () => {
    const { agent, csrfToken } = await createVerifiedUser(app);
    await createVerifiedUser(app, { username: 'arif' });

    const profile = await agent
      .patch('/api/users/me')
      .set('X-CSRF-Token', csrfToken)
      .send({ displayName: '  Nadia\u202E R ', bio: 'Hello' })
      .expect(200);
    expect(profile.body.data).toMatchObject({ displayName: 'Nadia R', bio: 'Hello' });

    const taken = await agent
      .patch('/api/users/me/username')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'arif' })
      .expect(409);
    expect(taken.body.error.code).toBe('USERNAME_TAKEN');
    await agent
      .patch('/api/users/me/username')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'nadia.r' })
      .expect(200);
    const cooldown = await agent
      .patch('/api/users/me/username')
      .set('X-CSRF-Token', csrfToken)
      .send({ username: 'nadia.rahman' })
      .expect(429);
    expect(cooldown.body.error.message).toMatch(/7 days/);
  });

  it('merges partial settings and rejects invalid values', async () => {
    const { agent, csrfToken } = await createVerifiedUser(app);

    await agent
      .patch('/api/settings')
      .set('X-CSRF-Token', csrfToken)
      .send({ theme: 'dark' })
      .expect(200);
    const res = await agent
      .patch('/api/settings')
      .set('X-CSRF-Token', csrfToken)
      .send({ privacy: { readReceipts: false } })
      .expect(200);

    expect(res.body.data).toMatchObject({
      theme: 'dark',
      privacy: { readReceipts: false, lastSeen: 'friends' },
      notifications: { preview: 'name_only' },
    });
    await agent
      .patch('/api/settings')
      .set('X-CSRF-Token', csrfToken)
      .send({ theme: 'neon' })
      .expect(400);
  });
});

describe('account deletion', () => {
  it('requires the password, removes personal data and frees the username', async () => {
    const { agent, csrfToken, user } = await createVerifiedUser(app);

    await agent
      .delete('/api/users/me')
      .set('X-CSRF-Token', csrfToken)
      .send({ password: 'wrong-password-1', confirm: 'DELETE' })
      .expect(400);
    await agent
      .delete('/api/users/me')
      .set('X-CSRF-Token', csrfToken)
      .send({ password: PASSWORD, confirm: 'DELETE' })
      .expect(204);

    const tombstone = await User.findById(user.id).select('+passwordHash').lean();
    expect(tombstone).toMatchObject({ status: 'deleted', displayName: 'Deleted account' });
    expect(tombstone.email).toBeUndefined();
    expect(tombstone.username).toBeUndefined();
    expect(tombstone.passwordHash).toBeUndefined();
    expect(await Session.countDocuments({ userId: user.id })).toBe(0);

    expect((await agent.get('/api/auth/session')).body.data.user).toBeNull();
    await browserAgent(app)
      .post('/api/auth/login')
      .send({ identifier: 'nadia', password: PASSWORD })
      .expect(401);
    await browserAgent(app).post('/api/auth/register').send(registration()).expect(202);
  });
});

describe('development mailbox', () => {
  it('shows emails in development (console transport) so links can be opened locally', async () => {
    const devApp = createTestApp({ NODE_ENV: 'development' });
    const agent = browserAgent(devApp);
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

    await agent.post('/api/auth/register').send(registration()).expect(202);
    const res = await agent.get('/api/dev/mailbox').expect(200);

    expect(res.body.data[0]).toMatchObject({
      to: 'nadia@example.com',
      subject: 'Verify your email address',
    });
    expect(res.body.data[0].text).toContain(`${ORIGIN}/verify-email?token=`);
    consoleInfo.mockRestore();
  });

  it('does not exist in test or SMTP configurations', async () => {
    await request(app).get('/api/dev/mailbox').expect(404);
    const smtpApp = createTestApp({
      NODE_ENV: 'development',
      MAIL_TRANSPORT: 'smtp',
      SMTP_HOST: 'smtp.example.com',
      SMTP_USER: 'user',
      SMTP_PASS: 'pass',
    });
    await request(smtpApp).get('/api/dev/mailbox').expect(404);
  });
});
