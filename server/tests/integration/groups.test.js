import { createHash, randomUUID, webcrypto } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Conversation } from '../../src/models/Conversation.js';
import {
  clearDatabase,
  createTestApp,
  createVerifiedUser,
  fakeEnvelope,
  silentLogger,
} from '../helpers/testApp.js';
import { startTestDatabase } from '../helpers/testDatabase.js';

// docs/GROUPS.md

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

/** Registers a real-looking identity key for a user; returns its id. */
async function setUpKey(who) {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const spki = new Uint8Array(await webcrypto.subtle.exportKey('spki', pair.publicKey));
  const keyId = b64url(createHash('sha256').update(spki).digest().subarray(0, 16));
  await as(who)
    .post('/api/keys/setup', {
      keyId,
      publicKey: b64url(spki),
      backup: {
        v: 1,
        kdf: {
          alg: 'argon2id',
          memoryKiB: 65536,
          passes: 3,
          parallelism: 1,
          salt: b64url(Buffer.alloc(16, 1)),
        },
        iv: b64url(Buffer.alloc(12, 2)),
        ct: b64url(Buffer.alloc(200, 3)),
      },
    })
    .expect(201);
  who.keyId = keyId;
}

let database;
let app;
let nadia;
let arif;
let sadia;
let rafi;

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

/** A group key locked by `from` for `to` (the server can't open it, only checks the key ids). */
const box = (from, to, epoch = 1) => ({
  userId: to.user.id,
  epoch,
  box: {
    v: 1,
    sk: from.keyId,
    rk: to.keyId,
    iv: 'C'.repeat(16),
    ct: b64url(Buffer.alloc(48, epoch)),
  },
});

const groupEnvelope = (epoch = 1, label = 'hi') => ({
  v: 2,
  e: epoch,
  iv: 'D'.repeat(16),
  ct: Buffer.from(`group:${label}`.padEnd(16, '.')).toString('base64url'),
});

const send = (who, groupId, envelope) =>
  as(who).post(`/api/conversations/${groupId}/messages`, {
    clientMessageId: randomUUID(),
    envelope,
  });

async function createGroup(name = 'Study group', members = [arif, sadia]) {
  const res = await as(nadia)
    .post('/api/groups', {
      name,
      memberIds: members.map((m) => m.user.id),
      keyBoxes: [nadia, ...members].map((m) => box(nadia, m)),
    })
    .expect(201);
  return res.body.data;
}

const history = async (who, groupId) =>
  (await as(who).get(`/api/conversations/${groupId}/messages`).expect(200)).body.data.messages;

beforeEach(async () => {
  await clearDatabase();
  app = createTestApp();
  nadia = await createVerifiedUser(app, { username: 'nadia', displayName: 'Nadia' });
  arif = await createVerifiedUser(app, { username: 'arif', displayName: 'Arif' });
  sadia = await createVerifiedUser(app, { username: 'sadia', displayName: 'Sadia' });
  rafi = await createVerifiedUser(app, { username: 'rafi', displayName: 'Rafi' });
  for (const who of [nadia, arif, sadia, rafi]) await setUpKey(who);
  await makeFriends(nadia, arif);
  await makeFriends(nadia, sadia);
  await makeFriends(nadia, rafi);
});

describe('creating a group', () => {
  it('makes me admin with my friends as members, and everyone sees it', async () => {
    const group = await createGroup();
    expect(group).toMatchObject({ type: 'group', peer: null, canMessage: true });
    expect(group.group).toMatchObject({ name: 'Study group', myRole: 'admin', keyEpoch: 1 });
    expect(group.group.members.map((m) => [m.username, m.role])).toEqual([
      ['nadia', 'admin'],
      ['arif', 'member'],
      ['sadia', 'member'],
    ]);

    const arifList = (await as(arif).get('/api/conversations').expect(200)).body.data;
    expect(arifList).toHaveLength(1);
    expect(arifList[0].group).toMatchObject({ name: 'Study group', myRole: 'member' });
    expect(arifList[0].unreadCount).toBe(0); // the "created" notice isn't unread

    const [notice] = await history(sadia, group.id);
    expect(notice).toMatchObject({
      type: 'system',
      senderId: nadia.user.id,
      system: { action: 'created', name: 'Study group' },
    });
  });

  it('needs at least 2 friends, only friends, and a key for every member', async () => {
    await as(nadia)
      .post('/api/groups', {
        name: 'Duo',
        memberIds: [arif.user.id],
        keyBoxes: [box(nadia, nadia), box(nadia, arif), box(nadia, arif)],
      })
      .expect(400);

    // Arif and Sadia aren't friends: Arif can't put Sadia in a group.
    await makeFriends(arif, rafi);
    await as(arif)
      .post('/api/groups', {
        name: 'Nope',
        memberIds: [rafi.user.id, sadia.user.id],
        keyBoxes: [arif, rafi, sadia].map((m) => box(arif, m)),
      })
      .expect(403);

    // A key missing for Sadia.
    await as(nadia)
      .post('/api/groups', {
        name: 'Missing key',
        memberIds: [arif.user.id, sadia.user.id],
        keyBoxes: [box(nadia, nadia), box(nadia, arif), box(nadia, arif)],
      })
      .expect(400);

    // A key locked to someone's wrong identity key.
    await as(nadia)
      .post('/api/groups', {
        name: 'Wrong key',
        memberIds: [arif.user.id, sadia.user.id],
        keyBoxes: [
          box(nadia, nadia),
          box(nadia, arif),
          { ...box(nadia, sadia), box: { ...box(nadia, sadia).box, rk: 'Z'.repeat(22) } },
        ],
      })
      .expect(400);
  });
});

describe('group messages', () => {
  it('accepts only the current group key format and reaches every member', async () => {
    const group = await createGroup();
    await send(arif, group.id, fakeEnvelope('pairwise')).expect(400);
    await send(arif, group.id, groupEnvelope(2)).expect(409);
    await send(arif, group.id, groupEnvelope(1, 'hello all')).expect(201);

    for (const who of [nadia, sadia]) {
      const [summary] = (await as(who).get('/api/conversations').expect(200)).body.data;
      expect(summary.unreadCount).toBe(1);
      expect(summary.lastMessage).toMatchObject({
        senderId: arif.user.id,
        envelope: { v: 2, e: 1 },
      });
    }
    // Not a member: the group doesn't exist for Rafi.
    await send(rafi, group.id, groupEnvelope(1)).expect(404);
    await as(rafi).get(`/api/conversations/${group.id}`).expect(404);
  });

  it('notices can’t be reacted to, pinned or unsent', async () => {
    const group = await createGroup();
    const [notice] = await history(arif, group.id);
    await as(arif).post(`/api/messages/${notice.id}/pin`).expect(404);
    await arif.agent
      .put(`/api/messages/${notice.id}/reaction`)
      .set('X-CSRF-Token', arif.csrfToken)
      .send({ emoji: '👍' })
      .expect(409);
  });
});

describe('managing members', () => {
  it('admins add friends, who can read the whole history', async () => {
    const group = await createGroup();
    await send(arif, group.id, groupEnvelope(1, 'before rafi')).expect(201);

    // Members who aren't admins can't add people.
    await as(arif)
      .post(`/api/groups/${group.id}/members`, { userIds: [rafi.user.id], keyBoxes: [] })
      .expect(403);
    // The new member needs the current key.
    await as(nadia)
      .post(`/api/groups/${group.id}/members`, { userIds: [rafi.user.id], keyBoxes: [] })
      .expect(400);

    const res = await as(nadia)
      .post(`/api/groups/${group.id}/members`, {
        userIds: [rafi.user.id],
        keyBoxes: [box(nadia, rafi, 1)],
      })
      .expect(200);
    expect(res.body.data.group.members.map((m) => m.username)).toContain('rafi');

    const messages = await history(rafi, group.id);
    expect(messages.map((m) => m.type)).toEqual(['system', 'e2ee', 'system']);
    expect(messages[2].system).toMatchObject({ action: 'added', targetIds: [rafi.user.id] });
    const keys = (await as(rafi).get(`/api/groups/${group.id}/keys`).expect(200)).body.data;
    expect(keys).toMatchObject({ keyEpoch: 1, rotationNeeded: false });
    expect(keys.boxes).toEqual([
      { epoch: 1, fromUserId: nadia.user.id, box: box(nadia, rafi, 1).box },
    ]);
  });

  it('removing someone ends their access and requires a new group key', async () => {
    const group = await createGroup();
    await as(arif).del(`/api/groups/${group.id}/members/${sadia.user.id}`).expect(403);
    await as(nadia).del(`/api/groups/${group.id}/members/${sadia.user.id}`).expect(200);

    await as(sadia).get(`/api/conversations/${group.id}`).expect(404);
    await as(sadia).get(`/api/groups/${group.id}/keys`).expect(404);

    // Nobody can send with the old key until someone makes a new one for the remaining members.
    const blocked = await send(arif, group.id, groupEnvelope(1)).expect(409);
    expect(blocked.body.error.code).toBe('GROUP_KEY_ROTATION_NEEDED');
    await as(arif)
      .post(`/api/groups/${group.id}/keys/rotate`, { epoch: 2, keyBoxes: [box(arif, arif, 2)] })
      .expect(400); // Nadia's key is missing
    await as(arif)
      .post(`/api/groups/${group.id}/keys/rotate`, {
        epoch: 2,
        keyBoxes: [box(arif, arif, 2), box(arif, nadia, 2), box(arif, sadia, 2)],
      })
      .expect(400); // Sadia isn't in the group any more
    await as(arif)
      .post(`/api/groups/${group.id}/keys/rotate`, {
        epoch: 2,
        keyBoxes: [box(arif, arif, 2), box(arif, nadia, 2)],
      })
      .expect(200);
    await as(nadia)
      .post(`/api/groups/${group.id}/keys/rotate`, {
        epoch: 2,
        keyBoxes: [box(nadia, arif, 2), box(nadia, nadia, 2)],
      })
      .expect(409); // already rotated by Arif

    await send(nadia, group.id, groupEnvelope(1)).expect(409);
    await send(nadia, group.id, groupEnvelope(2, 'after')).expect(201);
  });

  it('the last admin leaving promotes the longest-standing member; the last one deletes it', async () => {
    const group = await createGroup();
    await as(arif)
      .patch(`/api/groups/${group.id}/members/${nadia.user.id}`, { role: 'member' })
      .expect(403);
    await as(nadia)
      .patch(`/api/groups/${group.id}/members/${nadia.user.id}`, { role: 'member' })
      .expect(409); // a group needs an admin

    await as(nadia).post(`/api/groups/${group.id}/leave`).expect(204);
    await as(nadia).get(`/api/conversations/${group.id}`).expect(404);
    const arifView = (await as(arif).get(`/api/conversations/${group.id}`).expect(200)).body.data;
    expect(arifView.group.myRole).toBe('admin');
    expect((await history(arif, group.id)).at(-1).system.action).toBe('left');

    await as(arif).post(`/api/groups/${group.id}/leave`).expect(204);
    await as(sadia).post(`/api/groups/${group.id}/leave`).expect(204);
    expect(await Conversation.exists({ _id: group.id })).toBeNull();
  });

  it('admins rename the group; everyone sees a notice', async () => {
    const group = await createGroup();
    await as(arif).patch(`/api/groups/${group.id}`, { name: 'Mine now' }).expect(403);
    const res = await as(nadia)
      .patch(`/api/groups/${group.id}`, { name: 'CSE 3rd year' })
      .expect(200);
    expect(res.body.data.group.name).toBe('CSE 3rd year');
    expect((await history(sadia, group.id)).at(-1).system).toMatchObject({
      action: 'renamed',
      name: 'CSE 3rd year',
    });
  });
});

describe('sharing group keys', () => {
  it('members can give missing keys only to members, locked to their current key', async () => {
    const group = await createGroup();
    await as(arif)
      .post(`/api/groups/${group.id}/keys`, { keyBoxes: [box(arif, rafi, 1)] })
      .expect(400); // Rafi isn't a member
    await as(arif)
      .post(`/api/groups/${group.id}/keys`, {
        keyBoxes: [
          { ...box(arif, sadia, 1), box: { ...box(arif, sadia, 1).box, sk: nadia.keyId } },
        ],
      })
      .expect(400); // not locked with Arif's own key
    // Sadia already has a box for her current key: it's kept, not replaced.
    await as(arif)
      .post(`/api/groups/${group.id}/keys`, { keyBoxes: [box(arif, sadia, 1)] })
      .expect(204);
    const keys = (await as(sadia).get(`/api/groups/${group.id}/keys`).expect(200)).body.data;
    expect(keys.boxes).toHaveLength(1);
    expect(keys.boxes[0].fromUserId).toBe(nadia.user.id);
  });
});
