import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isAllowedSocketRequest } from '../../src/sockets/index.js';
import { connected, nextEvent, startLiveServer } from '../helpers/liveServer.js';
import {
  ORIGIN,
  PASSWORD,
  browserAgent,
  clearDatabase,
  createTestApp,
  createVerifiedUser,
  silentLogger,
} from '../helpers/testApp.js';
import { startTestDatabase } from '../helpers/testDatabase.js';

let database;
let app;
let live;

beforeAll(async () => {
  database = await startTestDatabase(silentLogger);
});

afterAll(async () => {
  await database?.stop();
});

beforeEach(async () => {
  await clearDatabase();
  app = createTestApp();
  live = await startLiveServer(app);
});

afterEach(async () => {
  await live.close();
});

const disconnected = (socket) =>
  new Promise((resolve) => socket.once('disconnect', (reason) => resolve(reason)));

describe('socket handshake security', () => {
  it('refuses connections without a session cookie', async () => {
    await expect(connected(live.connect())).rejects.toThrow('UNAUTHENTICATED');
  });

  it('refuses a valid cookie sent from another website (cross-site WebSocket hijacking)', async () => {
    const nadia = await createVerifiedUser(app);

    await expect(
      connected(live.connect({ cookie: nadia.cookie, origin: 'https://evil.example' })),
    ).rejects.toThrow();
  });

  it('refuses users whose email is not verified', async () => {
    const agent = browserAgent(app);
    await agent
      .post('/api/auth/register')
      .send({ email: 'new@example.com', username: 'newbie', displayName: 'N', password: PASSWORD })
      .expect(202);
    const login = await agent
      .post('/api/auth/login')
      .send({ identifier: 'newbie', password: PASSWORD })
      .expect(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];

    await expect(connected(live.connect({ cookie }))).rejects.toThrow('EMAIL_NOT_VERIFIED');
  });

  it('accepts a verified user from our own origin', async () => {
    const nadia = await createVerifiedUser(app);
    await expect(connected(live.connect({ cookie: nadia.cookie }))).resolves.toBeUndefined();
  });

  it('origin rule: Origin must match, or the browser must mark the request same-origin', () => {
    expect(isAllowedSocketRequest({ origin: ORIGIN }, ORIGIN)).toBe(true);
    expect(isAllowedSocketRequest({ origin: 'https://evil.example' }, ORIGIN)).toBe(false);
    expect(isAllowedSocketRequest({ 'sec-fetch-site': 'same-origin' }, ORIGIN)).toBe(true);
    expect(isAllowedSocketRequest({ 'sec-fetch-site': 'cross-site' }, ORIGIN)).toBe(false);
    expect(isAllowedSocketRequest({}, ORIGIN)).toBe(false);
  });
});

describe('live friendship updates', () => {
  it('delivers a friend request instantly to every open device of the recipient', async () => {
    const nadia = await createVerifiedUser(app, { username: 'nadia' });
    const arif = await createVerifiedUser(app, { username: 'arif' });
    const arifPhone = live.connect({ cookie: arif.cookie });
    const arifLaptop = live.connect({ cookie: arif.cookie });
    const nadiaTab = live.connect({ cookie: nadia.cookie });
    await Promise.all([connected(arifPhone), connected(arifLaptop), connected(nadiaTab)]);

    const events = Promise.all([
      nextEvent(arifPhone, 'friendship:updated'),
      nextEvent(arifLaptop, 'notification:new'),
      nextEvent(nadiaTab, 'friendship:updated'),
    ]);
    await nadia.agent
      .post('/api/friends/requests')
      .set('X-CSRF-Token', nadia.csrfToken)
      .send({ userId: arif.user.id })
      .expect(201);

    const [arifUpdate, arifNotification, nadiaUpdate] = await events;
    expect(arifUpdate).toEqual({ userId: nadia.user.id, relationship: 'incoming' });
    expect(arifNotification).toMatchObject({
      type: 'friend_request',
      actor: { username: 'nadia' },
    });
    expect(nadiaUpdate).toEqual({ userId: arif.user.id, relationship: 'outgoing' });
  });

  it('does not tell the blocked person they were blocked', async () => {
    const nadia = await createVerifiedUser(app, { username: 'nadia' });
    const arif = await createVerifiedUser(app, { username: 'arif' });
    const arifSocket = live.connect({ cookie: arif.cookie });
    await connected(arifSocket);

    const update = nextEvent(arifSocket, 'friendship:updated');
    await nadia.agent
      .post('/api/friends/blocks')
      .set('X-CSRF-Token', nadia.csrfToken)
      .send({ userId: arif.user.id })
      .expect(204);

    expect(await update).toEqual({ userId: nadia.user.id, relationship: 'none' });
  });
});

describe('ending sessions closes their live connections', () => {
  it('logout disconnects only that device', async () => {
    const nadia = await createVerifiedUser(app);
    const otherDevice = browserAgent(app);
    const otherLogin = await otherDevice
      .post('/api/auth/login')
      .send({ identifier: 'nadia', password: PASSWORD })
      .expect(200);
    const otherCookie = otherLogin.headers['set-cookie'][0].split(';')[0];

    const thisSocket = live.connect({ cookie: nadia.cookie });
    const otherSocket = live.connect({ cookie: otherCookie });
    await Promise.all([connected(thisSocket), connected(otherSocket)]);

    const closed = disconnected(thisSocket);
    await nadia.agent.post('/api/auth/logout').set('X-CSRF-Token', nadia.csrfToken).expect(204);

    expect(await closed).toBe('io server disconnect');
    expect(otherSocket.connected).toBe(true);
  });

  it('changing the password disconnects every other device', async () => {
    const nadia = await createVerifiedUser(app);
    const socket = live.connect({ cookie: nadia.cookie });
    await connected(socket);

    const closed = disconnected(socket);
    await nadia.agent
      .post('/api/auth/change-password')
      .set('X-CSRF-Token', nadia.csrfToken)
      .send({ currentPassword: PASSWORD, newPassword: 'green-mountain-tea-77' })
      .expect(200);

    expect(await closed).toBe('io server disconnect');
  });
});
