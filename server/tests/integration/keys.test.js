import { createHash, webcrypto } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IdentityKey } from '../../src/models/IdentityKey.js';
import { KeyBackup } from '../../src/models/KeyBackup.js';
import {
  PASSWORD,
  clearDatabase,
  createTestApp,
  createVerifiedUser,
  outbox,
  silentLogger,
} from '../helpers/testApp.js';
import { startTestDatabase } from '../helpers/testDatabase.js';

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

/** A real P-256 public key and a backup-shaped blob (the server can't tell it's not real). */
async function newKey() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const spki = new Uint8Array(await webcrypto.subtle.exportKey('spki', pair.publicKey));
  return {
    keyId: b64url(createHash('sha256').update(spki).digest().subarray(0, 16)),
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
  };
}

let database;
let app;
let nadia;
let arif;

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
});

beforeEach(async () => {
  await clearDatabase();
  app = createTestApp();
  nadia = await createVerifiedUser(app, { username: 'nadia' });
  arif = await createVerifiedUser(app, { username: 'arif' });
});

describe('encryption keys', () => {
  it('sets up my key once and gives me back only my locked backup', async () => {
    const key = await newKey();
    const res = await as(nadia).post('/api/keys/setup', key).expect(201);
    expect(res.body.data).toMatchObject({ currentKeyId: key.keyId, backup: key.backup });
    expect(res.body.data.keys).toEqual([
      expect.objectContaining({ keyId: key.keyId, publicKey: key.publicKey }),
    ]);

    await as(nadia)
      .post('/api/keys/setup', await newKey())
      .expect(409);
    expect((await as(arif).get('/api/keys/me').expect(200)).body.data).toEqual({
      currentKeyId: null,
      keys: [],
      backup: null,
    });
  });

  it('refuses weak backups and malformed keys', async () => {
    const key = await newKey();
    await as(nadia)
      .post('/api/keys/setup', {
        ...key,
        backup: { ...key.backup, kdf: { ...key.backup.kdf, memoryKiB: 1024 } },
      })
      .expect(400);
    await as(nadia)
      .post('/api/keys/setup', { ...key, publicKey: 'not-a-key' })
      .expect(400);
    await as(nadia)
      .post('/api/keys/setup', { ...key, backup: { ...key.backup, extra: 'x' } })
      .expect(400);
  });

  it('changing keys needs my password, keeps old keys and warns me by email', async () => {
    const first = await newKey();
    await as(nadia).post('/api/keys/setup', first).expect(201);
    const second = await newKey();

    await as(nadia)
      .post('/api/keys/rotate', { ...second, password: 'wrong-password-1' })
      .expect(400);
    const res = await as(nadia)
      .post('/api/keys/rotate', { ...second, password: PASSWORD })
      .expect(200);
    expect(res.body.data.currentKeyId).toBe(second.keyId);
    expect(res.body.data.keys.map((k) => k.keyId)).toEqual([second.keyId, first.keyId]);
    expect(outbox(app).at(-1)).toMatchObject({
      to: nadia.email,
      subject: 'Your encryption key was reset',
    });

    await as(nadia)
      .put('/api/keys/backup', { backup: second.backup, password: 'nope-nope-1' })
      .expect(400);
    await as(nadia)
      .put('/api/keys/backup', { backup: second.backup, password: PASSWORD })
      .expect(204);
  });

  it('shares public keys with signed-in people, but not between blocked users', async () => {
    const key = await newKey();
    await as(nadia).post('/api/keys/setup', key).expect(201);
    const seen = await as(arif).get(`/api/keys/users/${nadia.user.id}`).expect(200);
    expect(seen.body.data).toMatchObject({ currentKeyId: key.keyId });
    expect(JSON.stringify(seen.body)).not.toContain(key.backup.ct); // never the backup

    await as(nadia).post('/api/friends/blocks', { userId: arif.user.id }).expect(204);
    await as(arif).get(`/api/keys/users/${nadia.user.id}`).expect(404);
  });

  it('deleting the account removes the locked keys but keeps public keys for old messages', async () => {
    await as(nadia)
      .post('/api/keys/setup', await newKey())
      .expect(201);
    await nadia.agent
      .delete('/api/users/me')
      .set('X-CSRF-Token', nadia.csrfToken)
      .send({ password: PASSWORD, confirm: 'DELETE' })
      .expect(204);
    expect(await KeyBackup.countDocuments()).toBe(0);
    expect(await IdentityKey.countDocuments()).toBe(1);
  });
});
