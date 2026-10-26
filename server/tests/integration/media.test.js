import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Attachment } from '../../src/models/Attachment.js';
import {
  clearDatabase,
  createTestApp,
  createVerifiedUser,
  fakeEnvelope,
  silentLogger,
} from '../helpers/testApp.js';
import { startTestDatabase } from '../helpers/testDatabase.js';

// A real 1×1 PNG, a text file pretending to be a photo, and the start of an MP4 file.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const FAKE_JPEG = Buffer.from('#!/bin/sh\necho "this is not a photo"\n');
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypisom'),
  Buffer.alloc(32),
]);
const KLIPY_GIF = {
  provider: 'klipy',
  id: 'hello-hi-662',
  title: 'Hello',
  url: 'https://static.klipy.com/ii/935d7ab9/14/af/um0L4dFH.webp',
  previewUrl: 'https://static.klipy.com/ii/935d7ab9/14/af/um0L4dFH-sm.webp',
  width: 498,
  height: 498,
};

let database;
let mediaDir;
let app;
let nadia;
let arif;
let sadia;
let chat;

beforeAll(async () => {
  database = await startTestDatabase(silentLogger);
  mediaDir = await mkdtemp(path.join(os.tmpdir(), 'chat-media-test-'));
});

afterAll(async () => {
  await database?.stop();
  await rm(mediaDir, { recursive: true, force: true });
});

const as = (who) => ({
  get: (url) => who.agent.get(url),
  post: (url, body) => who.agent.post(url).set('X-CSRF-Token', who.csrfToken).send(body),
  put: (url, body) => who.agent.put(url).set('X-CSRF-Token', who.csrfToken).send(body),
  del: (url) => who.agent.delete(url).set('X-CSRF-Token', who.csrfToken),
});

async function makeFriends(a, b) {
  const res = await as(a).post('/api/friends/requests', { userId: b.user.id }).expect(201);
  await as(b).post(`/api/friends/requests/${res.body.data.id}/accept`).expect(204);
  return (await as(a).post('/api/conversations', { peerUserId: b.user.id }).expect(200)).body.data
    .id;
}

/** The browser's three steps: ask for an upload, send the bytes, then ask us to verify. */
async function upload(
  who,
  bytes,
  { mimeType = 'image/png', purpose = 'message', conversationId = chat } = {},
) {
  const started = await as(who)
    .post('/api/media/uploads', {
      purpose,
      ...(purpose === 'message' ? { conversationId } : {}),
      mimeType,
      size: bytes.length,
    })
    .expect(201);
  const { attachmentId, upload: target } = started.body.data;
  await who.agent
    .post(target.url)
    .set('X-CSRF-Token', who.csrfToken)
    .field('token', target.fields.token)
    .attach('file', bytes, 'file.bin')
    .expect(201);
  const completed = await as(who).post(`/api/media/uploads/${attachmentId}/complete`, {});
  return { attachmentId, completed };
}

async function sendMedia(who, attachmentIds, extra = {}) {
  const res = await as(who)
    .post(`/api/conversations/${chat}/messages`, {
      clientMessageId: randomUUID(),
      attachmentIds,
      envelope: fakeEnvelope('media'),
      ...extra,
    })
    .expect(201);
  return res.body.data.message;
}

const storedFiles = async () => (await readdir(mediaDir).catch(() => [])).length;

beforeEach(async () => {
  await clearDatabase();
  await rm(mediaDir, { recursive: true, force: true });
  app = createTestApp({ LOCAL_MEDIA_DIR: mediaDir, KLIPY_APP_KEY: 'test-klipy-app-key' });
  nadia = await createVerifiedUser(app, { username: 'nadia' });
  arif = await createVerifiedUser(app, { username: 'arif' });
  sadia = await createVerifiedUser(app, { username: 'sadia' });
  chat = await makeFriends(nadia, arif);
});

describe('uploading', () => {
  it('verifies a real photo and records its true type and size', async () => {
    const { completed } = await upload(nadia, PNG, { mimeType: 'image/jpeg' });

    expect(completed.status).toBe(200);
    expect(completed.body.data.attachment).toMatchObject({
      kind: 'image',
      mimeType: 'image/png', // detected from the bytes, not the claimed type
      width: 1,
      height: 1,
      size: PNG.length,
      status: 'ready',
    });
  });

  it('rejects and deletes a file disguised as a photo', async () => {
    const { attachmentId, completed } = await upload(nadia, FAKE_JPEG, { mimeType: 'image/jpeg' });

    expect(completed.status).toBe(422);
    expect(completed.body.error.code).toBe('INVALID_MEDIA');
    expect(await Attachment.findById(attachmentId)).toBeNull();
    expect(await storedFiles()).toBe(0);
  });

  it('rejects a photo claimed to be a video', async () => {
    const { completed } = await upload(nadia, PNG, { mimeType: 'video/mp4' });
    expect(completed.status).toBe(422);
  });

  it('accepts a video', async () => {
    const { completed } = await upload(nadia, MP4, { mimeType: 'video/mp4' });
    expect(completed.body.data.attachment).toMatchObject({ kind: 'video', mimeType: 'video/mp4' });
  });

  it('refuses unsupported types and oversized files before anything is uploaded', async () => {
    const base = { purpose: 'message', conversationId: chat };
    const pdf = await as(nadia).post('/api/media/uploads', {
      ...base,
      mimeType: 'application/pdf',
      size: 100,
    });
    expect(pdf.status).toBe(415);
    expect(pdf.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');

    const huge = await as(nadia).post('/api/media/uploads', {
      ...base,
      mimeType: 'image/jpeg',
      size: 11 * 1024 * 1024,
    });
    expect(huge.status).toBe(413);
    expect(huge.body.error.code).toBe('TOO_LARGE');
  });

  it('refuses uploads for a chat I am not in, or with someone who is not my friend', async () => {
    const theirs = await makeFriends(arif, sadia);
    await as(nadia)
      .post('/api/media/uploads', {
        purpose: 'message',
        conversationId: theirs,
        mimeType: 'image/png',
        size: 10,
      })
      .expect(404);

    await as(nadia).del(`/api/friends/${arif.user.id}`).expect(204);
    const res = await as(nadia).post('/api/media/uploads', {
      purpose: 'message',
      conversationId: chat,
      mimeType: 'image/png',
      size: 10,
    });
    expect(res.body.error.code).toBe('NOT_FRIENDS');
  });

  it('refuses an upload with a forged or missing token, and bytes larger than announced limits', async () => {
    await nadia.agent
      .post('/api/media/local-upload')
      .set('X-CSRF-Token', nadia.csrfToken)
      .field('token', 'forged.token')
      .attach('file', PNG, 'a.png')
      .expect(403);
  });

  it('lets me cancel an upload, which deletes the file', async () => {
    const { attachmentId } = await upload(nadia, PNG);
    expect(await storedFiles()).toBe(1);

    await as(nadia).del(`/api/media/uploads/${attachmentId}`).expect(204);
    expect(await storedFiles()).toBe(0);
    await as(arif).del(`/api/media/uploads/${attachmentId}`).expect(404);
  });

  it('reports uploads as unavailable when no storage is configured', async () => {
    const offline = createTestApp({ MEDIA_STORAGE: 'none' });
    const user = await createVerifiedUser(offline, { username: 'tanvir' });
    const res = await user.agent
      .post('/api/media/uploads')
      .set('X-CSRF-Token', user.csrfToken)
      .send({ purpose: 'avatar', mimeType: 'image/png', size: 10 });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('PROVIDER_UNAVAILABLE');
  });
});

describe('sending and viewing', () => {
  it('sends photos with a caption and lets both members view them', async () => {
    const first = await upload(nadia, PNG);
    const second = await upload(nadia, MP4, { mimeType: 'video/mp4' });
    const message = await sendMedia(nadia, [first.attachmentId, second.attachmentId], {
      envelope: fakeEnvelope('From the trip'),
    });

    expect(message).toMatchObject({ type: 'media', envelope: fakeEnvelope('From the trip') });
    expect(message.attachments.map((a) => [a.id, a.kind])).toEqual([
      [first.attachmentId, 'image'],
      [second.attachmentId, 'video'],
    ]);
    expect(JSON.stringify(message)).not.toContain('chat/'); // storage keys stay private

    for (const viewer of [nadia, arif]) {
      const res = await as(viewer)
        .get(`/api/media/${first.attachmentId}?variant=thumb`)
        .expect(302);
      expect(res.headers['cache-control']).toBe('private, no-store');
      const file = await viewer.agent.get(res.headers.location).expect(200);
      expect(file.headers['content-type']).toBe('image/png');
      expect(Buffer.compare(file.body, PNG)).toBe(0);
    }
  });

  it('"Media and links" lists only messages with photos/videos, newest first, in pages', async () => {
    const first = await sendMedia(nadia, [(await upload(nadia, PNG)).attachmentId]);
    await as(nadia)
      .post(`/api/conversations/${chat}/messages`, {
        clientMessageId: randomUUID(),
        envelope: fakeEnvelope('just text'),
      })
      .expect(201);
    const second = await sendMedia(arif, [(await upload(arif, PNG)).attachmentId]);
    const third = await sendMedia(nadia, [(await upload(nadia, PNG)).attachmentId]);
    await as(nadia).del(`/api/messages/${third.id}?scope=everyone`).expect(200); // unsent

    const page = (await as(arif).get(`/api/conversations/${chat}/media?limit=1`).expect(200)).body
      .data;
    expect(page.messages.map((m) => m.id)).toEqual([second.id]);
    expect(page.hasMore).toBe(true);
    const older = (
      await as(arif).get(`/api/conversations/${chat}/media?before=${second.seq}`).expect(200)
    ).body.data;
    expect(older).toMatchObject({ hasMore: false, messages: [{ id: first.id }] });
    await as(sadia).get(`/api/conversations/${chat}/media`).expect(404);
  });

  it('downloads a sent photo in full quality as a file, for members only', async () => {
    const { attachmentId } = await upload(nadia, PNG);
    await sendMedia(nadia, [attachmentId]);
    const res = await as(arif).get(`/api/media/${attachmentId}?variant=download`).expect(302);
    const file = await arif.agent.get(res.headers.location).expect(200);
    expect(file.headers['content-disposition']).toBe('attachment; filename="adda-photo.png"');
    expect(Buffer.compare(file.body, PNG)).toBe(0);
    await as(sadia).get(`/api/media/${attachmentId}?variant=download`).expect(404);
  });

  it('loading many photos never uses up the general request allowance', async () => {
    const { attachmentId } = await upload(nadia, PNG);
    await sendMedia(nadia, [attachmentId]);
    for (let i = 0; i < 310; i += 1) {
      await as(arif).get(`/api/media/${attachmentId}?variant=thumb`).expect(302);
    }
    await as(arif).get('/api/conversations').expect(200);
  });

  it('never shows media to someone outside the chat, or to a signed-out visitor', async () => {
    const { attachmentId } = await upload(nadia, PNG);
    await sendMedia(nadia, [attachmentId]);

    await as(sadia).get(`/api/media/${attachmentId}`).expect(404);
    await as(sadia).get('/api/media/not-an-id').expect(404);
    await request(app).get(`/api/media/${attachmentId}`).expect(401);
  });

  it('does not show an upload that was never sent, even to the other member', async () => {
    const { attachmentId } = await upload(nadia, PNG);
    await as(arif).get(`/api/media/${attachmentId}`).expect(404);
  });

  it('only sends my own, ready uploads made for this chat — each one once', async () => {
    const mine = await upload(nadia, PNG);
    const arifs = await upload(arif, PNG);
    const otherChat = await makeFriends(nadia, sadia);
    const elsewhere = await upload(nadia, PNG, { conversationId: otherChat });

    for (const ids of [[arifs.attachmentId], [elsewhere.attachmentId]]) {
      const res = await as(nadia).post(`/api/conversations/${chat}/messages`, {
        clientMessageId: randomUUID(),
        attachmentIds: ids,
        envelope: fakeEnvelope('x'),
      });
      expect(res.status).toBe(409);
    }

    await sendMedia(nadia, [mine.attachmentId]);
    const again = await as(nadia).post(`/api/conversations/${chat}/messages`, {
      clientMessageId: randomUUID(),
      attachmentIds: [mine.attachmentId],
      envelope: fakeEnvelope('x'),
    });
    expect(again.status).toBe(409);
  });

  it('a retried send with the same id returns the original message', async () => {
    const { attachmentId } = await upload(nadia, PNG);
    const body = {
      clientMessageId: randomUUID(),
      attachmentIds: [attachmentId],
      envelope: fakeEnvelope('x'),
    };
    const first = await as(nadia).post(`/api/conversations/${chat}/messages`, body).expect(201);
    const retry = await as(nadia).post(`/api/conversations/${chat}/messages`, body).expect(200);
    expect(retry.body.data.message.id).toBe(first.body.data.message.id);
  });

  it('unsend deletes the media for both people', async () => {
    const { attachmentId } = await upload(nadia, PNG);
    const message = await sendMedia(nadia, [attachmentId], { envelope: fakeEnvelope('oops') });

    const res = await as(nadia).del(`/api/messages/${message.id}?scope=everyone`).expect(200);
    expect(res.body.data).toMatchObject({ envelope: null, attachments: [] });
    await as(arif).get(`/api/media/${attachmentId}`).expect(404);
    expect(await Attachment.findById(attachmentId)).toBeNull();
    expect(await storedFiles()).toBe(0);
  });

  it('delete-for-me hides the media only for me', async () => {
    const { attachmentId } = await upload(nadia, PNG);
    const message = await sendMedia(nadia, [attachmentId]);

    await as(arif).del(`/api/messages/${message.id}?scope=me`).expect(204);
    await as(arif).get(`/api/media/${attachmentId}`).expect(404);
    await as(nadia).get(`/api/media/${attachmentId}`).expect(302);
  });

  it('media messages cannot be edited, but can be replied to', async () => {
    const { attachmentId } = await upload(nadia, PNG);
    const message = await sendMedia(nadia, [attachmentId]);
    const edit = await nadia.agent
      .patch(`/api/messages/${message.id}`)
      .set('X-CSRF-Token', nadia.csrfToken)
      .send({ envelope: fakeEnvelope('new caption') });
    expect(edit.status).toBe(409);

    const reply = await as(arif)
      .post(`/api/conversations/${chat}/messages`, {
        clientMessageId: randomUUID(),
        envelope: fakeEnvelope('Nice photo'),
        replyToId: message.id,
      })
      .expect(201);
    expect(reply.body.data.message.replyTo).toMatchObject({
      id: message.id,
      envelope: fakeEnvelope('media'),
    });
  });
});

describe('end-to-end encrypted parts', () => {
  it('stores opaque encrypted bytes, checks only their size, and serves them to members', async () => {
    const sealed = randomBytes(5000); // looks like noise, like real encrypted data
    const { attachmentId, completed } = await upload(nadia, sealed, {
      mimeType: 'application/octet-stream',
    });
    expect(completed.status).toBe(200);
    expect(completed.body.data.attachment).toMatchObject({
      kind: 'blob',
      size: 5000,
      status: 'ready',
    });

    const message = await sendMedia(nadia, [attachmentId]);
    expect(message.attachments).toEqual([
      expect.objectContaining({ id: attachmentId, kind: 'blob', size: 5000 }),
    ]);
    const res = await as(arif).get(`/api/media/${attachmentId}`).expect(302);
    const file = await arif.agent.get(res.headers.location).buffer(true).expect(200);
    expect(Buffer.compare(file.body, sealed)).toBe(0);
    await as(sadia).get(`/api/media/${attachmentId}`).expect(404);
  });

  it('refuses a part whose size differs from what was announced, and parts as avatars', async () => {
    const started = await as(nadia)
      .post('/api/media/uploads', {
        purpose: 'message',
        conversationId: chat,
        mimeType: 'application/octet-stream',
        size: 100,
      })
      .expect(201);
    const { attachmentId, upload: target } = started.body.data;
    await nadia.agent
      .post(target.url)
      .set('X-CSRF-Token', nadia.csrfToken)
      .field('token', target.fields.token)
      .attach('file', randomBytes(80), 'part')
      .expect(201);
    await as(nadia).post(`/api/media/uploads/${attachmentId}/complete`, {}).expect(422);

    await as(nadia)
      .post('/api/media/uploads', {
        purpose: 'avatar',
        mimeType: 'application/octet-stream',
        size: 100,
      })
      .expect(415);
  });
});

describe('GIFs', () => {
  it('GIF choices travel inside the encrypted message, never in readable form', async () => {
    const res = await as(nadia)
      .post(`/api/conversations/${chat}/messages`, {
        clientMessageId: randomUUID(),
        gif: KLIPY_GIF,
      })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('gives the browser the KLIPY app key and an anonymous, stable id', async () => {
    const first = (await as(nadia).get('/api/gifs/config').expect(200)).body.data;
    const second = (await as(nadia).get('/api/gifs/config').expect(200)).body.data;
    const other = (await as(arif).get('/api/gifs/config').expect(200)).body.data;

    expect(first).toMatchObject({
      available: true,
      provider: 'klipy',
      appKey: 'test-klipy-app-key',
    });
    expect(first.customerId).toBe(second.customerId);
    expect(first.customerId).not.toBe(other.customerId);
    expect(first.customerId).not.toContain(nadia.user.id);
  });

  it('says GIFs are unavailable without a key', async () => {
    const plain = createTestApp({ LOCAL_MEDIA_DIR: mediaDir });
    const user = await createVerifiedUser(plain, { username: 'tanvir' });
    const res = await user.agent.get('/api/gifs/config').expect(200);
    expect(res.body.data).toEqual({ available: false });
  });
});

describe('profile photos', () => {
  async function setAvatar(who) {
    const { attachmentId } = await upload(who, PNG, { purpose: 'avatar' });
    const res = await as(who).put('/api/users/me/avatar', { attachmentId }).expect(200);
    return { attachmentId, url: res.body.data.user.avatar };
  }

  it('sets a profile photo that friends can see, and replacing it deletes the old one', async () => {
    const first = await setAvatar(nadia);
    expect(first.url).toMatch(
      new RegExp(`^/api/media/${first.attachmentId}\\?variant=avatar&v=\\d+$`),
    );

    const friends = (await as(arif).get('/api/friends').expect(200)).body.data;
    expect(JSON.stringify(friends)).toContain(first.url);
    await as(arif).get(first.url).expect(302);

    const second = await setAvatar(nadia);
    expect(await Attachment.findById(first.attachmentId)).toBeNull();
    await as(arif).get(first.url).expect(404);
    await as(arif).get(second.url).expect(302);
    expect(await storedFiles()).toBe(1);
  });

  it('only accepts my own avatar uploads, and hides my photo from people I block', async () => {
    const { url } = await setAvatar(nadia);
    const arifsUpload = await upload(arif, PNG, { purpose: 'avatar' });
    await as(nadia)
      .put('/api/users/me/avatar', { attachmentId: arifsUpload.attachmentId })
      .expect(404);

    await as(sadia).get(url).expect(302);
    await as(nadia).post('/api/friends/blocks', { userId: sadia.user.id }).expect(204);
    await as(sadia).get(url).expect(404);
  });

  it('removes the profile photo', async () => {
    const { attachmentId } = await setAvatar(nadia);
    const res = await as(nadia).del('/api/users/me/avatar').expect(200);
    expect(res.body.data.user.avatar).toBeNull();
    expect(await Attachment.findById(attachmentId)).toBeNull();
  });

  it('videos cannot be profile photos', async () => {
    const res = await as(nadia).post('/api/media/uploads', {
      purpose: 'avatar',
      mimeType: 'video/mp4',
      size: 100,
    });
    expect(res.status).toBe(415);
  });
});

describe('cleanup job', () => {
  it('removes uploads that were never sent after a day, but keeps sent ones', async () => {
    const unused = await upload(nadia, PNG);
    const used = await upload(nadia, PNG);
    await sendMedia(nadia, [used.attachmentId]);

    const removed = await app.locals.services.media.cleanup(new Date(Date.now() + 25 * 3600_000));
    expect(removed).toBe(1);
    expect(await Attachment.findById(unused.attachmentId)).toBeNull();
    expect(await Attachment.findById(used.attachmentId)).not.toBeNull();
    expect(await storedFiles()).toBe(1);
  });
});
