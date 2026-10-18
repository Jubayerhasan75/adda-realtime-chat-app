import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connected, nextEvent, startLiveServer } from '../helpers/liveServer.js';
import {
  clearDatabase,
  createTestApp,
  createVerifiedUser,
  silentLogger,
} from '../helpers/testApp.js';
import { startTestDatabase } from '../helpers/testDatabase.js';

const OFFLINE_DELAY_MS = 150;
let database;
let app;
let live;
let nadia;
let arif;
let sadia;

beforeAll(async () => {
  database = await startTestDatabase(silentLogger);
});

afterAll(async () => {
  await database?.stop();
});

const as = (who) => ({
  post: (url, body) => who.agent.post(url).set('X-CSRF-Token', who.csrfToken).send(body),
  patch: (url, body) => who.agent.patch(url).set('X-CSRF-Token', who.csrfToken).send(body),
});

beforeEach(async () => {
  await clearDatabase();
  app = createTestApp({ PRESENCE_OFFLINE_DELAY_MS: String(OFFLINE_DELAY_MS) });
  live = await startLiveServer(app);
  nadia = await createVerifiedUser(app, { username: 'nadia' });
  arif = await createVerifiedUser(app, { username: 'arif' });
  sadia = await createVerifiedUser(app, { username: 'sadia' });
  const request = await as(nadia)
    .post('/api/friends/requests', { userId: arif.user.id })
    .expect(201);
  await as(arif).post(`/api/friends/requests/${request.body.data.id}/accept`).expect(204);
});

afterEach(async () => {
  await live.close();
});

/** Connects like the app does and returns the socket plus the first presence snapshot. */
async function open(who, { visible = true } = {}) {
  const socket = live.connect({ cookie: who.cookie, auth: { visible } });
  const snapshot = nextEvent(socket, 'presence:snapshot');
  await connected(socket);
  return { socket, snapshot: (await snapshot).users };
}

/** Collects every presence update a socket receives. */
function updates(socket) {
  const list = [];
  socket.on('presence:update', (payload) => list.push(payload));
  return list;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const emit = (socket, event, payload) => socket.timeout(3000).emitWithAck(event, payload);

describe('presence', () => {
  it('shows friends coming online right away, and only to friends', async () => {
    const arifApp = await open(arif);
    expect(arifApp.snapshot).toEqual([{ userId: nadia.user.id, online: false, lastSeenAt: null }]);
    const sadiaApp = await open(sadia);
    const sadiaSees = updates(sadiaApp.socket);

    const arrival = nextEvent(arifApp.socket, 'presence:update');
    const nadiaApp = await open(nadia);
    expect(await arrival).toEqual({ userId: nadia.user.id, online: true, lastSeenAt: null });
    expect(nadiaApp.snapshot).toEqual([{ userId: arif.user.id, online: true, lastSeenAt: null }]);

    await wait(OFFLINE_DELAY_MS * 2);
    expect(sadiaSees).toEqual([]); // not a friend: learns nothing
  });

  it('goes offline after a short delay with a "last seen" time; a quick reconnect never flickers', async () => {
    const arifApp = await open(arif);
    const seen = updates(arifApp.socket);
    const first = await open(nadia);

    // Reconnecting within the delay: no "offline" at all.
    first.socket.disconnect();
    const second = await open(nadia);
    await wait(OFFLINE_DELAY_MS * 2);
    expect(seen.map((u) => u.online)).toEqual([true]);

    const before = Date.now();
    second.socket.disconnect();
    await wait(OFFLINE_DELAY_MS * 3);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toMatchObject({ userId: nadia.user.id, online: false });
    expect(new Date(seen[1].lastSeenAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('counts only devices with the app on screen', async () => {
    const arifApp = await open(arif);
    const seen = updates(arifApp.socket);
    const nadiaApp = await open(nadia, { visible: false });
    await wait(OFFLINE_DELAY_MS * 2);
    expect(seen).toEqual([]); // a background tab is not "online"

    await emit(nadiaApp.socket, 'presence:visibility', { visible: true });
    await wait(50);
    expect(seen.at(-1)).toMatchObject({ online: true });

    await emit(nadiaApp.socket, 'presence:visibility', { visible: false });
    await wait(OFFLINE_DELAY_MS * 3);
    expect(seen.at(-1)).toMatchObject({ online: false });
  });

  it('respects privacy both ways: hidden status is not shared, and hiding mine hides theirs', async () => {
    const arifApp = await open(arif);
    await open(nadia);

    // Nadia hides her online status: Arif is told he can no longer see it.
    const hidden = nextEvent(arifApp.socket, 'presence:update');
    await as(nadia)
      .patch('/api/settings', { privacy: { onlineStatus: 'nobody' } })
      .expect(200);
    expect(await hidden).toEqual({ userId: nadia.user.id, online: null, lastSeenAt: null });

    // Arif hides his last seen: he gets a fresh snapshot without anyone's last seen.
    await as(nadia)
      .patch('/api/settings', { privacy: { onlineStatus: 'friends' } })
      .expect(200);
    const snapshot = nextEvent(arifApp.socket, 'presence:snapshot');
    await as(arif)
      .patch('/api/settings', { privacy: { lastSeen: 'nobody' } })
      .expect(200);
    const [nadiaForArif] = (await snapshot).users;
    expect(nadiaForArif.lastSeenAt).toBeNull();
  });

  it('rejects malformed visibility reports', async () => {
    const { socket } = await open(nadia);
    const reply = await emit(socket, 'presence:visibility', { visible: 'yes' });
    expect(reply.ok).toBe(false);
  });
});
