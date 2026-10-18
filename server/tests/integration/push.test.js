import { randomUUID } from 'node:crypto';
import webpush from 'web-push';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PushSubscription } from '../../src/models/PushSubscription.js';
import {
  clearDatabase,
  createTestApp,
  createVerifiedUser,
  fakeEnvelope,
  silentLogger,
} from '../helpers/testApp.js';
import { startTestDatabase } from '../helpers/testDatabase.js';

const VAPID = webpush.generateVAPIDKeys();
const subscriptionFor = (id) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/device-${id}`,
  expirationTime: null,
  keys: {
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
});

let database;
let app;
let sent;
let failNext;
let nadia;
let arif;
let chat;

beforeAll(async () => {
  database = await startTestDatabase(silentLogger);
});

afterAll(async () => {
  await database?.stop();
});

const as = (who) => ({
  get: (url) => who.agent.get(url),
  post: (url, body) => who.agent.post(url).set('X-CSRF-Token', who.csrfToken).send(body),
  patch: (url, body) => who.agent.patch(url).set('X-CSRF-Token', who.csrfToken).send(body),
  del: (url, body) => who.agent.delete(url).set('X-CSRF-Token', who.csrfToken).send(body),
});

const sendText = (who, label) =>
  as(who)
    .post(`/api/conversations/${chat}/messages`, {
      clientMessageId: randomUUID(),
      envelope: fakeEnvelope(label),
    })
    .expect(201);

/** Push is sent in the background; give it a moment, then report what was sent. */
async function pushesAfter(action) {
  const before = sent.length;
  await action();
  await new Promise((resolve) => setTimeout(resolve, 150));
  return sent.slice(before).map(({ subscription, payload }) => ({
    endpoint: subscription.endpoint,
    ...JSON.parse(payload),
  }));
}

beforeEach(async () => {
  await clearDatabase();
  sent = [];
  failNext = null;
  app = createTestApp(
    { VAPID_PUBLIC_KEY: VAPID.publicKey, VAPID_PRIVATE_KEY: VAPID.privateKey },
    {
      pushSender: async (subscription, payload, options) => {
        if (failNext) {
          const statusCode = failNext;
          failNext = null;
          throw Object.assign(new Error('push failed'), { statusCode });
        }
        sent.push({ subscription, payload, options });
      },
    },
  );
  nadia = await createVerifiedUser(app, { username: 'nadia', displayName: 'Nadia' });
  arif = await createVerifiedUser(app, { username: 'arif', displayName: 'Arif' });
  const request = await as(nadia)
    .post('/api/friends/requests', { userId: arif.user.id })
    .expect(201);
  await as(arif).post(`/api/friends/requests/${request.body.data.id}/accept`).expect(204);
  chat = (await as(nadia).post('/api/conversations', { peerUserId: arif.user.id }).expect(200)).body
    .data.id;
  await as(arif)
    .post('/api/notifications/subscriptions', subscriptionFor('arif-phone'))
    .expect(204);
});

describe('push subscriptions', () => {
  it('gives out only the public key, and accepts only real push services', async () => {
    const res = await as(arif).get('/api/notifications/vapid-public-key').expect(200);
    expect(res.body.data.publicKey).toBe(VAPID.publicKey);
    expect(JSON.stringify(res.body)).not.toContain(VAPID.privateKey);

    const evil = { ...subscriptionFor('x'), endpoint: 'https://evil.example/collect' };
    await as(arif).post('/api/notifications/subscriptions', evil).expect(400);
    const local = { ...subscriptionFor('x'), endpoint: 'http://127.0.0.1:27017/' };
    await as(arif).post('/api/notifications/subscriptions', local).expect(400);
  });

  it('logging out removes that device’s subscription', async () => {
    expect(await PushSubscription.countDocuments()).toBe(1);
    await as(arif).post('/api/auth/logout').expect(204);
    expect(await PushSubscription.countDocuments()).toBe(0);
  });

  it('a device that changes hands follows the new account; I can only remove my own', async () => {
    await as(nadia)
      .post('/api/notifications/subscriptions', subscriptionFor('arif-phone'))
      .expect(204);
    const owner = await PushSubscription.findOne({
      endpoint: subscriptionFor('arif-phone').endpoint,
    });
    expect(String(owner.userId)).toBe(nadia.user.id);

    await as(arif)
      .del('/api/notifications/subscriptions', { endpoint: owner.endpoint })
      .expect(204);
    expect(await PushSubscription.countDocuments()).toBe(1); // not Arif's any more
  });

  it('is unavailable (503) when the server has no VAPID keys', async () => {
    const plain = createTestApp();
    const user = await createVerifiedUser(plain, { username: 'tanvir' });
    const key = await as(user).get('/api/notifications/vapid-public-key').expect(200);
    expect(key.body.data.publicKey).toBeNull();
    await as(user).post('/api/notifications/subscriptions', subscriptionFor('t')).expect(503);
  });
});

describe('message notifications', () => {
  it('notifies a recipient who is away, without the text by default', async () => {
    const pushes = await pushesAfter(() => sendText(nadia, 'Library at 10?'));
    expect(pushes).toEqual([
      {
        endpoint: subscriptionFor('arif-phone').endpoint,
        title: 'Nadia',
        body: 'New message',
        tag: `chat-${chat}`,
        url: `/chats/${chat}`,
      },
    ]);
    expect(sent[0].options).toMatchObject({ TTL: 86400, urgency: 'high' });
  });

  it('follows the preview setting', async () => {
    await as(arif)
      .patch('/api/settings', { notifications: { preview: 'name_and_text' } })
      .expect(200);
    const [withText] = await pushesAfter(() => sendText(nadia, 'Library at 10?'));
    // The server can't read it: it forwards the encrypted message for the phone to decrypt.
    expect(withText).toMatchObject({ title: 'Nadia', body: 'New message' });
    expect(withText.encrypted).toMatchObject({
      conversationId: chat,
      senderId: nadia.user.id,
      envelope: fakeEnvelope('Library at 10?'),
    });

    await as(arif)
      .patch('/api/settings', { notifications: { preview: 'none' } })
      .expect(200);
    const [hidden] = await pushesAfter(() => sendText(nadia, 'Secret plan'));
    expect(JSON.stringify(hidden)).not.toMatch(/Nadia/);
    expect(hidden.encrypted).toBeUndefined();
  });

  it('stays quiet when the chat is muted, notifications are off, or the app is on screen', async () => {
    await as(arif)
      .patch(`/api/conversations/${chat}/settings`, { mutedUntil: '2099-01-01T00:00:00.000Z' })
      .expect(200);
    expect(await pushesAfter(() => sendText(nadia, 'muted?'))).toEqual([]);
    await as(arif).patch(`/api/conversations/${chat}/settings`, { mutedUntil: null }).expect(200);

    await as(arif)
      .patch('/api/settings', { notifications: { enabled: false } })
      .expect(200);
    expect(await pushesAfter(() => sendText(nadia, 'off?'))).toEqual([]);
    await as(arif)
      .patch('/api/settings', { notifications: { enabled: true } })
      .expect(200);

    const { presence } = app.locals.services;
    await presence.connected(arif.user.id, 'socket-1', true);
    expect(await pushesAfter(() => sendText(nadia, 'you are here'))).toEqual([]);
    await presence.setVisible(arif.user.id, 'socket-1', false);
    expect(await pushesAfter(() => sendText(nadia, 'app in background'))).toHaveLength(1);
  });

  it('never notifies the sender', async () => {
    await as(nadia)
      .post('/api/notifications/subscriptions', subscriptionFor('nadia-phone'))
      .expect(204);
    const pushes = await pushesAfter(() => sendText(nadia, 'hi'));
    expect(pushes.map((p) => p.endpoint)).toEqual([subscriptionFor('arif-phone').endpoint]);
  });

  it('removes subscriptions the push service says are gone', async () => {
    failNext = 410;
    expect(await pushesAfter(() => sendText(nadia, 'hello?'))).toEqual([]);
    expect(await PushSubscription.countDocuments()).toBe(0);
  });

  it('keeps a subscription after a temporary failure', async () => {
    failNext = 500;
    await pushesAfter(() => sendText(nadia, 'one'));
    expect((await PushSubscription.findOne()).failureCount).toBe(1);
    await pushesAfter(() => sendText(nadia, 'two'));
    expect((await PushSubscription.findOne()).failureCount).toBe(0);
  });
});

describe('friend notifications', () => {
  it('notifies about friend requests unless switched off', async () => {
    const sadia = await createVerifiedUser(app, { username: 'sadia', displayName: 'Sadia' });
    const pushes = await pushesAfter(() =>
      as(sadia).post('/api/friends/requests', { userId: arif.user.id }).expect(201),
    );
    expect(pushes).toMatchObject([{ body: 'Sadia sent you a friend request', url: '/friends' }]);

    await as(arif)
      .patch('/api/settings', { notifications: { friendRequests: false } })
      .expect(200);
    const tanvir = await createVerifiedUser(app, { username: 'tanvir', displayName: 'Tanvir' });
    const none = await pushesAfter(() =>
      as(tanvir).post('/api/friends/requests', { userId: arif.user.id }).expect(201),
    );
    expect(none).toEqual([]);
  });
});
