import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Message } from '../../src/models/Message.js';
import { connected, nextEvent, startLiveServer } from '../helpers/liveServer.js';
import {
  clearDatabase,
  createTestApp,
  createVerifiedUser,
  fakeEnvelope,
  silentLogger,
} from '../helpers/testApp.js';
import { startTestDatabase } from '../helpers/testDatabase.js';

let database;
let app;
let live;
let nadia;
let arif;
let conversationId;

beforeAll(async () => {
  database = await startTestDatabase(silentLogger);
});

afterAll(async () => {
  await database?.stop();
});

const as = (who) => ({
  post: (url, body) => who.agent.post(url).set('X-CSRF-Token', who.csrfToken).send(body),
});

beforeEach(async () => {
  await clearDatabase();
  app = createTestApp();
  live = await startLiveServer(app);
  nadia = await createVerifiedUser(app, { username: 'nadia' });
  arif = await createVerifiedUser(app, { username: 'arif' });
  const request = await as(nadia)
    .post('/api/friends/requests', { userId: arif.user.id })
    .expect(201);
  await as(arif).post(`/api/friends/requests/${request.body.data.id}/accept`).expect(204);
  const open = await as(nadia).post('/api/conversations', { peerUserId: arif.user.id }).expect(200);
  conversationId = open.body.data.id;
});

afterEach(async () => {
  await live.close();
});

async function socketFor(who) {
  const socket = live.connect({ cookie: who.cookie });
  await connected(socket);
  return socket;
}

const emit = (socket, event, payload) => socket.timeout(3000).emitWithAck(event, payload);

describe('sending over the live connection', () => {
  it('acknowledges with the stored message and delivers it to both people on every device', async () => {
    const [nadiaPhone, nadiaLaptop, arifPhone] = await Promise.all([
      socketFor(nadia),
      socketFor(nadia),
      socketFor(arif),
    ]);
    const received = Promise.all([
      nextEvent(arifPhone, 'message:new'),
      nextEvent(nadiaLaptop, 'message:new'),
    ]);
    const clientMessageId = randomUUID();

    const ack = await emit(nadiaPhone, 'message:send', {
      conversationId,
      clientMessageId,
      envelope: fakeEnvelope('Hi!'),
    });

    expect(ack).toMatchObject({
      ok: true,
      data: {
        message: {
          seq: 1,
          envelope: fakeEnvelope('Hi!'),
          senderId: nadia.user.id,
          clientMessageId,
        },
      },
    });
    const [toArif, toOtherDevice] = await received;
    expect(toArif.message.id).toBe(ack.data.message.id);
    expect(toOtherDevice.message.id).toBe(ack.data.message.id);
  });

  it('a retry with the same clientMessageId returns the original message (no duplicate)', async () => {
    const socket = await socketFor(nadia);
    const payload = {
      conversationId,
      clientMessageId: randomUUID(),
      envelope: fakeEnvelope('once'),
    };

    const first = await emit(socket, 'message:send', payload);
    const retry = await emit(socket, 'message:send', payload);

    expect(retry.data.message.id).toBe(first.data.message.id);
    expect(await Message.countDocuments()).toBe(1);
  });

  it('rejects forged fields, other people’s conversations and spam', async () => {
    const sadia = await createVerifiedUser(app, { username: 'sadia' });
    const intruder = await socketFor(sadia);
    const socket = await socketFor(nadia);

    const forged = await emit(socket, 'message:send', {
      conversationId,
      clientMessageId: randomUUID(),
      envelope: fakeEnvelope('x'),
      senderId: arif.user.id,
    });
    expect(forged).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });

    const notMine = await emit(intruder, 'message:send', {
      conversationId,
      clientMessageId: randomUUID(),
      envelope: fakeEnvelope('let me in'),
    });
    expect(notMine).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });

    // Fresh connection: the limit counts every event, including the invalid one above.
    const spammer = await socketFor(nadia);
    const results = [];
    for (let i = 0; i < 31; i += 1) {
      results.push(
        await emit(spammer, 'message:send', {
          conversationId,
          clientMessageId: randomUUID(),
          envelope: fakeEnvelope(`m${i}`),
        }),
      );
    }
    expect(results.at(-1)).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    expect(results.slice(0, 30).every((r) => r.ok)).toBe(true);
  });
});

describe('ticks: delivered and seen', () => {
  it('tells the sender when the message reached the other device and when it was read', async () => {
    const [nadiaSocket, arifSocket, arifOtherDevice] = await Promise.all([
      socketFor(nadia),
      socketFor(arif),
      socketFor(arif),
    ]);
    await emit(nadiaSocket, 'message:send', {
      conversationId,
      clientMessageId: randomUUID(),
      envelope: fakeEnvelope('hello'),
    });

    const delivered = nextEvent(nadiaSocket, 'receipt:update');
    await expect(
      emit(arifSocket, 'message:delivered', { conversationId, upToSeq: 1 }),
    ).resolves.toMatchObject({
      ok: true,
      data: { deliveredUpToSeq: 1 },
    });
    expect(await delivered).toEqual({
      conversationId,
      userId: arif.user.id,
      deliveredUpToSeq: 1,
      readUpToSeq: 0,
    });

    const seen = nextEvent(nadiaSocket, 'receipt:update');
    const otherDeviceSync = nextEvent(arifOtherDevice, 'conversation:read-sync');
    await emit(arifSocket, 'conversation:read', { conversationId, upToSeq: 1 });
    expect(await seen).toMatchObject({ readUpToSeq: 1 });
    expect(await otherDeviceSync).toEqual({ conversationId, readUpToSeq: 1 });
  });

  it('ignores stale or repeated receipts (watermarks only move forward)', async () => {
    const [nadiaSocket, arifSocket] = await Promise.all([socketFor(nadia), socketFor(arif)]);
    for (let i = 0; i < 3; i += 1) {
      await emit(nadiaSocket, 'message:send', {
        conversationId,
        clientMessageId: randomUUID(),
        envelope: fakeEnvelope(`${i}`),
      });
    }

    await emit(arifSocket, 'conversation:read', { conversationId, upToSeq: 3 });
    const stale = await emit(arifSocket, 'conversation:read', { conversationId, upToSeq: 1 });

    expect(stale.data.readUpToSeq).toBe(3);
  });
});

describe('typing indicator', () => {
  it('relays typing to the other person and stops it when the typer disconnects', async () => {
    const [nadiaSocket, arifSocket] = await Promise.all([socketFor(nadia), socketFor(arif)]);

    const started = nextEvent(arifSocket, 'typing:update');
    await emit(nadiaSocket, 'typing:start', { conversationId });
    expect(await started).toEqual({ conversationId, userId: nadia.user.id, isTyping: true });

    const stopped = nextEvent(arifSocket, 'typing:update');
    nadiaSocket.disconnect();
    expect(await stopped).toEqual({ conversationId, userId: nadia.user.id, isTyping: false });
  });
});

describe('live message changes', () => {
  it('edits and reactions reach both people; "delete for me" reaches only my devices', async () => {
    const [nadiaSocket, nadiaOtherDevice, arifSocket] = await Promise.all([
      socketFor(nadia),
      socketFor(nadia),
      socketFor(arif),
    ]);
    const sent = await emit(nadiaSocket, 'message:send', {
      conversationId,
      clientMessageId: randomUUID(),
      envelope: fakeEnvelope('helo'),
    });
    const messageId = sent.data.message.id;
    const call = (who, method, url, body) =>
      who.agent[method](url).set('X-CSRF-Token', who.csrfToken).send(body);

    const edited = nextEvent(arifSocket, 'message:updated');
    await call(nadia, 'patch', `/api/messages/${messageId}`, {
      envelope: fakeEnvelope('hello'),
    }).expect(200);
    expect((await edited).message).toMatchObject({
      id: messageId,
      envelope: fakeEnvelope('hello'),
      version: 2,
    });

    const reacted = nextEvent(nadiaSocket, 'message:updated');
    await call(arif, 'put', `/api/messages/${messageId}/reaction`, { emoji: '❤️' }).expect(200);
    expect((await reacted).message.reactions).toEqual([{ userId: arif.user.id, emoji: '❤️' }]);

    let arifGotHidden = false;
    arifSocket.on('message:hidden', () => {
      arifGotHidden = true;
    });
    const hidden = nextEvent(nadiaOtherDevice, 'message:hidden');
    await call(nadia, 'delete', `/api/messages/${messageId}?scope=me`).expect(204);
    expect(await hidden).toEqual({ conversationId, messageId });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(arifGotHidden).toBe(false);
  });
});
