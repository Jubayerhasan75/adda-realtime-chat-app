import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conversation } from '../../src/models/Conversation.js';
import { Message } from '../../src/models/Message.js';
import { User } from '../../src/models/User.js';
import {
  PASSWORD,
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
  del: (url) => who.agent.delete(url).set('X-CSRF-Token', who.csrfToken),
});

async function makeFriends(a, b) {
  const res = await as(a).post('/api/friends/requests', { userId: b.user.id }).expect(201);
  await as(b).post(`/api/friends/requests/${res.body.data.id}/accept`).expect(204);
}

async function openChat(a, b) {
  const res = await as(a).post('/api/conversations', { peerUserId: b.user.id }).expect(200);
  return res.body.data.id;
}

const send = (who, conversationId, label, clientMessageId = randomUUID()) =>
  as(who).post(`/api/conversations/${conversationId}/messages`, {
    clientMessageId,
    envelope: fakeEnvelope(label),
  });

const listFor = async (who) => (await as(who).get('/api/conversations').expect(200)).body.data;

beforeEach(async () => {
  await clearDatabase();
  app = createTestApp();
  nadia = await createVerifiedUser(app, { username: 'nadia' });
  arif = await createVerifiedUser(app, { username: 'arif' });
  sadia = await createVerifiedUser(app, { username: 'sadia' });
  await makeFriends(nadia, arif);
});

describe('opening conversations', () => {
  it('only between friends, never with yourself', async () => {
    const notFriends = await as(nadia)
      .post('/api/conversations', { peerUserId: sadia.user.id })
      .expect(403);
    expect(notFriends.body.error.code).toBe('NOT_FRIENDS');
    await as(nadia).post('/api/conversations', { peerUserId: nadia.user.id }).expect(400);
    await as(nadia).post('/api/conversations', { peerUserId: 'bad' }).expect(400);
  });

  it('returns the same single conversation however often (and concurrently) it is opened', async () => {
    const ids = await Promise.all([
      openChat(nadia, arif),
      openChat(arif, nadia),
      openChat(nadia, arif),
    ]);

    expect(new Set(ids).size).toBe(1);
    expect(await Conversation.countDocuments()).toBe(1);
  });

  it('only lists conversations that have messages', async () => {
    const id = await openChat(nadia, arif);
    expect(await listFor(arif)).toEqual([]);

    await send(nadia, id, 'Hi Arif').expect(201);

    expect((await listFor(arif)).map((c) => c.id)).toEqual([id]);
  });
});

describe('access control (IDOR)', () => {
  it('a non-member gets 404 for every conversation route, as if it did not exist', async () => {
    const id = await openChat(nadia, arif);
    await send(nadia, id, 'private').expect(201);

    await as(sadia).get(`/api/conversations/${id}`).expect(404);
    await as(sadia).get(`/api/conversations/${id}/messages`).expect(404);
    await send(sadia, id, 'let me in').expect(404);
    await as(sadia).post(`/api/conversations/${id}/read`, { upToSeq: 1 }).expect(404);
    await as(sadia).get('/api/conversations/not-an-id').expect(404);
    await request(app).get(`/api/conversations/${id}/messages`).expect(401);
  });

  it('ignores a forged sender in the body', async () => {
    const id = await openChat(nadia, arif);
    const res = await as(nadia)
      .post(`/api/conversations/${id}/messages`, {
        clientMessageId: randomUUID(),
        envelope: fakeEnvelope('x'),
        senderId: arif.user.id,
      })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('sending', () => {
  it('stores a message once even when the same send is retried', async () => {
    const id = await openChat(nadia, arif);
    const clientMessageId = randomUUID();

    const first = await send(nadia, id, 'Hello', clientMessageId).expect(201);
    const retry = await send(nadia, id, 'Hello', clientMessageId).expect(200);
    const [a, b] = await Promise.all([
      send(nadia, id, 'Again', randomUUID()),
      send(nadia, id, 'Hello', clientMessageId),
    ]);

    expect(retry.body.data.message.id).toBe(first.body.data.message.id);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await Message.countDocuments()).toBe(2);
  });

  it('gives concurrent messages unique, gap-free sequence numbers', async () => {
    const id = await openChat(nadia, arif);

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => send(i % 2 ? arif : nadia, id, `m${i}`)),
    );

    expect(results.every((res) => res.status === 201)).toBe(true);
    const seqs = results.map((res) => res.body.data.message.seq).sort((x, y) => x - y);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('accepts only end-to-end encrypted envelopes, never readable text', async () => {
    const id = await openChat(nadia, arif);
    const post = (body) =>
      as(nadia).post(`/api/conversations/${id}/messages`, {
        clientMessageId: randomUUID(),
        ...body,
      });

    await post({ text: 'plain text is refused' }).expect(400);
    await post({ envelope: fakeEnvelope('ok'), text: 'not alongside either' }).expect(400);
    await post({ envelope: { ...fakeEnvelope('x'), v: 2 } }).expect(400);
    await post({ envelope: { ...fakeEnvelope('x'), ct: 'not base64!' } }).expect(400);
    await post({ envelope: { ...fakeEnvelope('x'), ct: 'A'.repeat(24_001) } }).expect(400);
    await post({ envelope: { ...fakeEnvelope('x'), extra: 1 } }).expect(400);

    const stored = await post({ envelope: fakeEnvelope('secret words') }).expect(201);
    expect(stored.body.data.message.envelope).toEqual(fakeEnvelope('secret words'));
    expect(stored.body.data.message).not.toHaveProperty('text');
    const raw = await Message.findById(stored.body.data.message.id).lean();
    expect(raw.text).toBeNull();
    expect(JSON.stringify(raw)).not.toContain('secret words');
  });
});

describe('history, unread counts and receipts', () => {
  it('pages through history by sequence number', async () => {
    const id = await openChat(nadia, arif);
    // Seeded through the service: 35 rapid REST sends would (correctly) hit the rate limit.
    const sender = await User.findById(nadia.user.id);
    for (let i = 1; i <= 35; i += 1) {
      await app.locals.services.conversations.sendMessage(sender, {
        conversationId: id,
        clientMessageId: randomUUID(),
        envelope: fakeEnvelope(`message ${i}`),
      });
    }

    const latest = (await as(arif).get(`/api/conversations/${id}/messages`).expect(200)).body.data;
    expect(latest.hasMore).toBe(true);
    expect(latest.messages.map((m) => m.seq)).toEqual(Array.from({ length: 30 }, (_, i) => i + 6));

    const older = (await as(arif).get(`/api/conversations/${id}/messages?before=6`).expect(200))
      .body.data;
    expect(older).toMatchObject({ hasMore: false });
    expect(older.messages.map((m) => m.seq)).toEqual([1, 2, 3, 4, 5]);

    const newer = (await as(arif).get(`/api/conversations/${id}/messages?after=33`).expect(200))
      .body.data;
    expect(newer.messages.map((m) => m.seq)).toEqual([34, 35]);
    await as(arif).get(`/api/conversations/${id}/messages?before=1&after=2`).expect(400);
  });

  it('counts unread messages from the other person and clears them when read', async () => {
    const id = await openChat(nadia, arif);
    await send(nadia, id, 'one').expect(201);
    await send(nadia, id, 'two').expect(201);

    expect((await listFor(arif))[0]).toMatchObject({
      unreadCount: 2,
      lastMessage: { envelope: fakeEnvelope('two') },
    });
    expect((await listFor(nadia))[0].unreadCount).toBe(0); // own messages never count

    // Reading beyond the last message is clamped, never stored as a future position.
    const read = await as(arif)
      .post(`/api/conversations/${id}/read`, { upToSeq: 9999 })
      .expect(200);
    expect(read.body.data.readUpToSeq).toBe(2);
    expect((await listFor(arif))[0].unreadCount).toBe(0);
    expect((await listFor(nadia))[0].peerState).toEqual({ deliveredUpToSeq: 2, readUpToSeq: 2 });
  });

  it('replying marks the earlier messages as read', async () => {
    const id = await openChat(nadia, arif);
    await send(nadia, id, 'one').expect(201);
    await send(arif, id, 'reply').expect(201);

    expect((await listFor(arif))[0].unreadCount).toBe(0);
    expect((await listFor(nadia))[0]).toMatchObject({
      unreadCount: 1,
      peerState: { readUpToSeq: 2 },
    });
  });

  it('hides "seen" from both people when either turns read receipts off (reciprocal)', async () => {
    const id = await openChat(nadia, arif);
    await send(nadia, id, 'hello').expect(201);
    await as(arif).post(`/api/conversations/${id}/read`, { upToSeq: 1 }).expect(200);
    await as(arif)
      .patch('/api/settings', { privacy: { readReceipts: false } })
      .expect(200);

    expect((await listFor(nadia))[0].peerState).toEqual({ deliveredUpToSeq: 1 });
    expect((await listFor(arif))[0].peerState).toEqual({ deliveredUpToSeq: 1 });
  });
});

describe('when the friendship ends', () => {
  it('keeps history readable but stops new messages after unfriending or blocking', async () => {
    const id = await openChat(nadia, arif);
    await send(nadia, id, 'before').expect(201);

    await as(arif).del(`/api/friends/${nadia.user.id}`).expect(204);
    const blockedSend = await send(nadia, id, 'after').expect(403);
    expect(blockedSend.body.error.code).toBe('NOT_FRIENDS');
    expect((await listFor(nadia))[0].canMessage).toBe(false);
    const history = await as(nadia).get(`/api/conversations/${id}/messages`).expect(200);
    expect(history.body.data.messages.map((m) => envelopeLabel(m.envelope))).toEqual(['before']);

    await makeFriends(nadia, arif);
    await send(nadia, id, 'friends again').expect(201);
    await as(nadia).post('/api/friends/blocks', { userId: arif.user.id }).expect(204);
    await send(arif, id, 'blocked').expect(403);
  });

  it('shows a deleted account as "Deleted account" and keeps its messages', async () => {
    const id = await openChat(nadia, arif);
    await send(nadia, id, 'bye').expect(201);
    await nadia.agent
      .delete('/api/users/me')
      .set('X-CSRF-Token', nadia.csrfToken)
      .send({ password: PASSWORD, confirm: 'DELETE' })
      .expect(204);

    const [conversation] = await listFor(arif);
    expect(conversation).toMatchObject({
      peer: { displayName: 'Deleted account', username: null },
      canMessage: false,
      lastMessage: { envelope: fakeEnvelope('bye') },
    });
  });
});
