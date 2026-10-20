import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Message } from '../../src/models/Message.js';
import {
  clearDatabase,
  createTestApp,
  createVerifiedUser,
  envelopeLabel,
  fakeEnvelope,
  silentLogger,
} from '../helpers/testApp.js';
import { startTestDatabase } from '../helpers/testDatabase.js';

let database;
let app;
let nadia;
let arif;
let sadia;
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
  put: (url, body) => who.agent.put(url).set('X-CSRF-Token', who.csrfToken).send(body),
  patch: (url, body) => who.agent.patch(url).set('X-CSRF-Token', who.csrfToken).send(body),
  del: (url) => who.agent.delete(url).set('X-CSRF-Token', who.csrfToken),
});

async function makeFriends(a, b) {
  const res = await as(a).post('/api/friends/requests', { userId: b.user.id }).expect(201);
  await as(b).post(`/api/friends/requests/${res.body.data.id}/accept`).expect(204);
  return (await as(a).post('/api/conversations', { peerUserId: b.user.id }).expect(200)).body.data
    .id;
}

async function send(who, label, extra = {}, conversationId = chat) {
  const res = await as(who)
    .post(`/api/conversations/${conversationId}/messages`, {
      clientMessageId: randomUUID(),
      envelope: fakeEnvelope(label),
      ...extra,
    })
    .expect(201);
  return res.body.data.message;
}

const history = async (who, conversationId = chat) =>
  (await as(who).get(`/api/conversations/${conversationId}/messages`).expect(200)).body.data
    .messages;
const summary = async (who, conversationId = chat) =>
  (await as(who).get(`/api/conversations/${conversationId}`).expect(200)).body.data;
const ageMessage = (id, minutes) =>
  // Native driver: Mongoose treats createdAt as immutable and would silently skip this.
  Message.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(id) },
    { $set: { createdAt: new Date(Date.now() - minutes * 60_000) } },
  );

beforeEach(async () => {
  await clearDatabase();
  app = createTestApp();
  nadia = await createVerifiedUser(app, { username: 'nadia' });
  arif = await createVerifiedUser(app, { username: 'arif' });
  sadia = await createVerifiedUser(app, { username: 'sadia' });
  chat = await makeFriends(nadia, arif);
});

describe('editing', () => {
  it('lets the sender fix a message within 15 minutes, visible to both', async () => {
    const message = await send(nadia, 'helo');

    const res = await as(nadia)
      .patch(`/api/messages/${message.id}`, { envelope: fakeEnvelope('hello') })
      .expect(200);

    expect(res.body.data).toMatchObject({
      envelope: fakeEnvelope('hello'),
      version: 2,
      editedAt: expect.any(String),
    });
    expect(envelopeLabel((await history(arif))[0].envelope)).toBe('hello');
  });

  it('refuses other people’s messages, old messages and strangers', async () => {
    const message = await send(nadia, 'mine');

    await as(arif)
      .patch(`/api/messages/${message.id}`, { envelope: fakeEnvelope('hacked') })
      .expect(403);
    await as(sadia)
      .patch(`/api/messages/${message.id}`, { envelope: fakeEnvelope('x') })
      .expect(404);
    await ageMessage(message.id, 16);
    const late = await as(nadia)
      .patch(`/api/messages/${message.id}`, { envelope: fakeEnvelope('late') })
      .expect(409);
    expect(late.body.error.code).toBe('EDIT_WINDOW_CLOSED');
  });
});

describe('deleting', () => {
  it('"delete for me" hides it only for me', async () => {
    const message = await send(arif, 'secret');

    await as(nadia).del(`/api/messages/${message.id}?scope=me`).expect(204);

    expect(await history(nadia)).toEqual([]);
    expect((await summary(nadia)).unreadCount).toBe(0);
    expect((await history(arif)).map((m) => envelopeLabel(m.envelope))).toEqual(['secret']);
    await as(nadia)
      .patch(`/api/messages/${message.id}`, { envelope: fakeEnvelope('x') })
      .expect(404);
  });

  it('unsend removes the encrypted content, reactions and pin for everyone', async () => {
    const message = await send(nadia, 'oops, wrong chat');
    await as(arif).put(`/api/messages/${message.id}/reaction`, { emoji: '😂' }).expect(200);
    await as(arif).put(`/api/messages/${message.id}/pin`).expect(200);

    await as(arif).del(`/api/messages/${message.id}?scope=everyone`).expect(403);
    const res = await as(nadia).del(`/api/messages/${message.id}?scope=everyone`).expect(200);

    expect(res.body.data).toMatchObject({
      envelope: null,
      reactions: [],
      pinnedAt: null,
      unsentAt: expect.any(String),
    });
    const stored = await Message.findById(message.id).lean();
    expect(stored.envelope).toBeNull(); // really gone from the database, not just hidden
    expect((await history(arif))[0]).toMatchObject({
      envelope: null,
      unsentAt: expect.any(String),
    });
    expect((await summary(arif)).unreadCount).toBe(0);
    await as(arif).put(`/api/messages/${message.id}/reaction`, { emoji: '😂' }).expect(409);
  });

  it('unsend is limited to 24 hours', async () => {
    const message = await send(nadia, 'old');
    await ageMessage(message.id, 25 * 60);

    await as(nadia).del(`/api/messages/${message.id}?scope=everyone`).expect(409);
    await as(nadia).del(`/api/messages/${message.id}?scope=nobody`).expect(400);
  });
});

describe('replies', () => {
  it('quotes the original, and shows "unsent" if the original is unsent later', async () => {
    const original = await send(arif, 'Library at 10?');

    const reply = await send(nadia, 'Yes!', { replyToId: original.id });
    expect(reply.replyTo).toEqual({
      id: original.id,
      senderId: arif.user.id,
      clientMessageId: original.clientMessageId,
      envelope: fakeEnvelope('Library at 10?'),
      unsent: false,
    });

    await as(arif).del(`/api/messages/${original.id}?scope=everyone`).expect(200);
    expect((await history(nadia)).at(-1).replyTo).toMatchObject({ envelope: null, unsent: true });
  });

  it('cannot quote a message from another conversation', async () => {
    const otherChat = await makeFriends(nadia, sadia);
    const elsewhere = await send(sadia, 'private', {}, otherChat);

    await as(nadia)
      .post(`/api/conversations/${chat}/messages`, {
        clientMessageId: randomUUID(),
        envelope: fakeEnvelope('x'),
        replyToId: elsewhere.id,
      })
      .expect(400);
  });
});

describe('reactions', () => {
  it('one reaction per person; reacting again replaces it; it can be removed', async () => {
    const message = await send(nadia, 'Happy birthday!');

    await as(arif).put(`/api/messages/${message.id}/reaction`, { emoji: '❤️' }).expect(200);
    await as(arif).put(`/api/messages/${message.id}/reaction`, { emoji: '🎉' }).expect(200);
    const both = await as(nadia)
      .put(`/api/messages/${message.id}/reaction`, { emoji: '👩\u200D💻' })
      .expect(200);
    expect(both.body.data.reactions).toEqual([
      { userId: arif.user.id, emoji: '🎉' },
      { userId: nadia.user.id, emoji: '👩\u200D💻' },
    ]);

    const removed = await as(arif).del(`/api/messages/${message.id}/reaction`).expect(200);
    expect(removed.body.data.reactions).toEqual([{ userId: nadia.user.id, emoji: '👩\u200D💻' }]);
  });

  it('accepts only a single emoji and only from friends', async () => {
    const message = await send(nadia, 'hi');

    await as(arif).put(`/api/messages/${message.id}/reaction`, { emoji: 'lol' }).expect(400);
    await as(arif).put(`/api/messages/${message.id}/reaction`, { emoji: '❤️❤️' }).expect(400);
    await as(sadia).put(`/api/messages/${message.id}/reaction`, { emoji: '❤️' }).expect(404);
    await as(arif).del(`/api/friends/${nadia.user.id}`).expect(204);
    await as(arif).put(`/api/messages/${message.id}/reaction`, { emoji: '❤️' }).expect(403);
  });
});

describe('pins', () => {
  it('pins and unpins, lists pins, and allows at most 10', async () => {
    const messages = [];
    for (let i = 0; i < 11; i += 1) messages.push(await send(i % 2 ? arif : nadia, `m${i}`));

    for (const message of messages.slice(0, 10)) {
      await as(nadia).put(`/api/messages/${message.id}/pin`).expect(200);
    }
    const full = await as(arif).put(`/api/messages/${messages[10].id}/pin`).expect(409);
    expect(full.body.error.message).toMatch(/up to 10/);
    expect(
      (await as(arif).get(`/api/conversations/${chat}/pins`).expect(200)).body.data,
    ).toHaveLength(10);

    await as(arif).del(`/api/messages/${messages[0].id}/pin`).expect(200);
    await as(arif).put(`/api/messages/${messages[10].id}/pin`).expect(200);
    await as(sadia).get(`/api/conversations/${chat}/pins`).expect(404);
  });
});

describe('clear chat, mute and colors', () => {
  it('clearing hides history for me only; new messages still arrive', async () => {
    await send(arif, 'old 1');
    await send(arif, 'old 2');

    const cleared = await as(nadia).post(`/api/conversations/${chat}/clear`).expect(200);
    expect(cleared.body.data).toMatchObject({ unreadCount: 0, lastMessage: null });
    expect(await history(nadia)).toEqual([]);
    expect(await history(arif)).toHaveLength(2);

    await send(arif, 'new');
    expect((await history(nadia)).map((m) => envelopeLabel(m.envelope))).toEqual(['new']);
  });

  it('mute and color are personal settings of this chat', async () => {
    const until = new Date(Date.now() + 8 * 3600_000).toISOString();

    const res = await as(nadia)
      .patch(`/api/conversations/${chat}/settings`, { mutedUntil: until, accent: 'ocean' })
      .expect(200);

    expect(res.body.data.myState).toMatchObject({ mutedUntil: until, accent: 'ocean' });
    expect((await summary(arif)).myState).toMatchObject({ mutedUntil: null, accent: null });
    await as(nadia).patch(`/api/conversations/${chat}/settings`, { accent: 'neon' }).expect(400);
    // Any color as #rrggbb, but never other CSS.
    const custom = await as(nadia)
      .patch(`/api/conversations/${chat}/settings`, { accent: '#ff5a1f' })
      .expect(200);
    expect(custom.body.data.myState.accent).toBe('#ff5a1f');
    for (const bad of ['red', '#fff', 'url(x)', '#ff5a1f;color:red']) {
      await as(nadia).patch(`/api/conversations/${chat}/settings`, { accent: bad }).expect(400);
    }
    await as(sadia).patch(`/api/conversations/${chat}/settings`, { accent: 'ocean' }).expect(404);
  });
});

describe('delete chat', () => {
  it('removes the chat from my list only; a new message brings it back with just that message', async () => {
    await send(arif, 'old one');
    await send(nadia, 'old two');

    await as(nadia).del(`/api/conversations/${chat}`).expect(204);
    expect((await as(nadia).get('/api/conversations').expect(200)).body.data).toEqual([]);
    expect(await history(nadia)).toEqual([]);
    expect(await history(arif)).toHaveLength(2); // Arif keeps his copy
    await as(sadia).del(`/api/conversations/${chat}`).expect(404);

    await send(arif, 'new');
    const [back] = (await as(nadia).get('/api/conversations').expect(200)).body.data;
    expect(back.id).toBe(chat);
    expect((await history(nadia)).map((m) => envelopeLabel(m.envelope))).toEqual(['new']);
  });
});

describe('preview without side effects', () => {
  it('reading the latest messages (long-press preview) never marks them as read', async () => {
    await send(arif, 'one');
    await send(arif, 'two');

    const preview = await as(nadia).get(`/api/conversations/${chat}/messages?limit=4`).expect(200);

    expect(preview.body.data.messages.map((m) => envelopeLabel(m.envelope))).toEqual([
      'one',
      'two',
    ]);
    expect((await summary(nadia)).unreadCount).toBe(2);
    expect((await summary(arif)).peerState.readUpToSeq).toBe(0);
  });
});

describe('message search', () => {
  it('is not done by the server any more: it can’t read encrypted messages', async () => {
    await as(nadia).get('/api/search/messages?q=library').expect(404);
  });
});
