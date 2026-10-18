import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Friendship } from '../../src/models/Friendship.js';
import { User } from '../../src/models/User.js';
import {
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
let nadia;
let arif;

beforeAll(async () => {
  database = await startTestDatabase(silentLogger);
});

afterAll(async () => {
  await database?.stop();
});

beforeEach(async () => {
  await clearDatabase();
  app = createTestApp();
  nadia = await createVerifiedUser(app, { username: 'nadia', displayName: 'Nadia' });
  arif = await createVerifiedUser(app, { username: 'arif', displayName: 'Arif' });
});

/** Small client bound to one signed-in user. */
const as = (who) => ({
  get: (url) => who.agent.get(url),
  post: (url, body) => who.agent.post(url).set('X-CSRF-Token', who.csrfToken).send(body),
  del: (url) => who.agent.delete(url).set('X-CSRF-Token', who.csrfToken),
});

async function sendRequest(from, to) {
  const res = await as(from).post('/api/friends/requests', { userId: to.user.id }).expect(201);
  return res.body.data.id;
}

async function makeFriends(a, b) {
  const requestId = await sendRequest(a, b);
  await as(b).post(`/api/friends/requests/${requestId}/accept`).expect(204);
}

const relationshipIn = async (who, query, username) => {
  const res = await as(who).get(`/api/users/search?q=${query}`).expect(200);
  return res.body.data.find((item) => item.user.username === username)?.relationship;
};

describe('user search', () => {
  it('finds exact and prefix matches, exact first, never myself', async () => {
    await createVerifiedUser(app, { username: 'arif.h' });
    await createVerifiedUser(app, { username: 'arifa' });

    const res = await as(nadia).get('/api/users/search?q=ARIF').expect(200);

    expect(res.body.data.map((item) => item.user.username)).toEqual(['arif', 'arif.h', 'arifa']);
    expect(res.body.data[0]).toEqual({
      user: { id: arif.user.id, username: 'arif', displayName: 'Arif', bio: '', avatar: null },
      relationship: 'none',
    });
    const self = await as(nadia).get('/api/users/search?q=nadia').expect(200);
    expect(self.body.data).toEqual([]);
  });

  it('never exposes private fields', async () => {
    const res = await as(nadia).get('/api/users/search?q=arif').expect(200);
    const json = JSON.stringify(res.body);

    expect(json).not.toMatch(/email|password|settings|session/i);
  });

  it('hides unverified accounts and non-discoverable users unless the username is exact', async () => {
    await browserAgent(app)
      .post('/api/auth/register')
      .send({
        email: 'ghost@example.com',
        username: 'arif_ghost',
        displayName: 'G',
        password: PASSWORD,
      })
      .expect(202);
    await arif.agent
      .patch('/api/settings')
      .set('X-CSRF-Token', arif.csrfToken)
      .send({ privacy: { discoverable: false } })
      .expect(200);

    const prefix = await as(nadia).get('/api/users/search?q=ari').expect(200);
    const exact = await as(nadia).get('/api/users/search?q=arif').expect(200);

    expect(prefix.body.data).toEqual([]);
    expect(exact.body.data.map((item) => item.user.username)).toEqual(['arif']);
  });

  it('rejects invalid queries and requires a verified account', async () => {
    await as(nadia).get('/api/users/search?q=a%20b').expect(400);
    await as(nadia).get('/api/users/search?q[$ne]=x').expect(400);
    await request(app).get('/api/users/search?q=arif').expect(401);
  });
});

describe('friend requests', () => {
  it('sends a request that both people see, with a notification for the recipient', async () => {
    await sendRequest(nadia, arif);

    expect(await relationshipIn(nadia, 'arif', 'arif')).toBe('outgoing');
    expect(await relationshipIn(arif, 'nadia', 'nadia')).toBe('incoming');
    const incoming = await as(arif).get('/api/friends/requests?direction=incoming').expect(200);
    expect(incoming.body.data[0].user.username).toBe('nadia');
    const feed = await as(arif).get('/api/notifications').expect(200);
    expect(feed.body.data).toMatchObject({
      unreadCount: 1,
      items: [{ type: 'friend_request', actor: { username: 'nadia' } }],
    });
  });

  it('rejects duplicates, crossed requests, self-requests and unknown users', async () => {
    const requestId = await sendRequest(nadia, arif);

    const duplicate = await as(nadia)
      .post('/api/friends/requests', { userId: arif.user.id })
      .expect(409);
    expect(duplicate.body.error.code).toBe('REQUEST_EXISTS');
    const crossed = await as(arif)
      .post('/api/friends/requests', { userId: nadia.user.id })
      .expect(409);
    expect(crossed.body.error).toMatchObject({
      code: 'REQUEST_EXISTS_INCOMING',
      details: [{ path: 'requestId', issue: requestId }],
    });
    await as(nadia).post('/api/friends/requests', { userId: nadia.user.id }).expect(400);
    await as(nadia)
      .post('/api/friends/requests', { userId: '0'.repeat(24) })
      .expect(404);
    await as(nadia).post('/api/friends/requests', { userId: 'not-an-id' }).expect(400);
  });

  it('keeps exactly one request when both people press "Add" at the same moment', async () => {
    const results = await Promise.all([
      as(nadia).post('/api/friends/requests', { userId: arif.user.id }),
      as(arif).post('/api/friends/requests', { userId: nadia.user.id }),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await Friendship.countDocuments()).toBe(1);
  });

  it('only the recipient can accept or decline, only the requester can cancel', async () => {
    const requestId = await sendRequest(nadia, arif);

    await as(nadia).post(`/api/friends/requests/${requestId}/accept`).expect(404);
    await as(nadia).post(`/api/friends/requests/${requestId}/decline`).expect(404);
    await as(arif).del(`/api/friends/requests/${requestId}`).expect(404);
    await as(arif).post('/api/friends/requests/not-an-id/accept').expect(404);

    await as(nadia).del(`/api/friends/requests/${requestId}`).expect(204);
    expect(await relationshipIn(arif, 'nadia', 'nadia')).toBe('none');
    expect((await as(arif).get('/api/notifications')).body.data.items).toEqual([]);
  });

  it('accepting makes both friends and notifies the requester', async () => {
    await makeFriends(nadia, arif);

    const nadiaFriends = await as(nadia).get('/api/friends').expect(200);
    const arifFriends = await as(arif).get('/api/friends').expect(200);
    expect(nadiaFriends.body.data.map((f) => f.user.username)).toEqual(['arif']);
    expect(arifFriends.body.data.map((f) => f.user.username)).toEqual(['nadia']);

    const nadiaFeed = await as(nadia).get('/api/notifications').expect(200);
    expect(nadiaFeed.body.data.items[0]).toMatchObject({
      type: 'friend_accepted',
      actor: { username: 'arif' },
    });
    // The "request" notification is gone once it has been handled.
    expect((await as(arif).get('/api/notifications')).body.data.items).toEqual([]);

    const again = await as(nadia)
      .post('/api/friends/requests', { userId: arif.user.id })
      .expect(409);
    expect(again.body.error.code).toBe('ALREADY_FRIENDS');
  });

  it('after a decline the requester waits 7 days, but the decliner may send their own request', async () => {
    const requestId = await sendRequest(nadia, arif);
    await as(arif).post(`/api/friends/requests/${requestId}/decline`).expect(204);

    expect(await relationshipIn(nadia, 'arif', 'arif')).toBe('none');
    await as(nadia).post('/api/friends/requests', { userId: arif.user.id }).expect(429);
    await as(arif).post('/api/friends/requests', { userId: nadia.user.id }).expect(201);
    expect(await relationshipIn(nadia, 'arif', 'arif')).toBe('incoming');
  });

  it('removing a friend ends the friendship for both', async () => {
    await makeFriends(nadia, arif);

    await as(arif).del(`/api/friends/${nadia.user.id}`).expect(204);
    await as(arif).del(`/api/friends/${nadia.user.id}`).expect(404);

    expect((await as(nadia).get('/api/friends')).body.data).toEqual([]);
  });
});

describe('blocking', () => {
  it('removes the friendship, hides both people from each other and is not revealed', async () => {
    await makeFriends(nadia, arif);

    await as(nadia).post('/api/friends/blocks', { userId: arif.user.id }).expect(204);

    expect((await as(arif).get('/api/friends')).body.data).toEqual([]);
    expect((await as(arif).get('/api/users/search?q=nadia')).body.data).toEqual([]);
    expect((await as(nadia).get('/api/users/search?q=arif')).body.data).toEqual([]);
    // To Arif, Nadia looks like a missing account; Nadia can still open Arif to unblock.
    const hidden = await as(arif).get('/api/users/nadia').expect(404);
    expect(hidden.body.error.message).toBe('User not found');
    expect((await as(nadia).get('/api/users/arif')).body.data.relationship).toBe('blocked');
    const request_ = await as(arif)
      .post('/api/friends/requests', { userId: nadia.user.id })
      .expect(404);
    expect(request_.body.error.message).toBe('User not found');
  });

  it('unblocking does not restore the friendship', async () => {
    await makeFriends(nadia, arif);
    await as(nadia).post('/api/friends/blocks', { userId: arif.user.id }).expect(204);

    const blocked = await as(nadia).get('/api/friends/blocks').expect(200);
    expect(blocked.body.data.map((b) => b.user.username)).toEqual(['arif']);
    await as(nadia).del(`/api/friends/blocks/${arif.user.id}`).expect(204);

    expect(await relationshipIn(nadia, 'arif', 'arif')).toBe('none');
    expect((await as(nadia).get('/api/friends/blocks')).body.data).toEqual([]);
  });
});

describe('profiles, reports and notifications', () => {
  it('shows a public profile with the relationship', async () => {
    const res = await as(nadia).get('/api/users/ARIF').expect(200);

    expect(res.body.data).toMatchObject({ user: { username: 'arif' }, relationship: 'none' });
    expect((await as(nadia).get('/api/users/nadia')).body.data.relationship).toBe('self');
    await as(nadia).get('/api/users/nobody_here').expect(404);
  });

  it('accepts reports (idempotently) but not about yourself', async () => {
    await as(nadia).post(`/api/users/${arif.user.id}/report`, { reason: 'spam' }).expect(201);
    await as(nadia).post(`/api/users/${arif.user.id}/report`, { reason: 'spam' }).expect(201);
    await as(nadia).post(`/api/users/${nadia.user.id}/report`, { reason: 'spam' }).expect(400);
    await as(nadia).post(`/api/users/${arif.user.id}/report`, { reason: 'weird' }).expect(400);
  });

  it('marks only my own notifications as read', async () => {
    await sendRequest(nadia, arif);
    const feed = await as(arif).get('/api/notifications');
    const id = feed.body.data.items[0].id;

    await as(nadia)
      .post('/api/notifications/read', { ids: [id] })
      .expect(204);
    expect((await as(arif).get('/api/notifications')).body.data.unreadCount).toBe(1);
    await as(arif).post('/api/notifications/read', { all: true }).expect(204);
    expect((await as(arif).get('/api/notifications')).body.data.unreadCount).toBe(0);
  });
});

describe('account deletion', () => {
  it('removes the deleted user from friends lists', async () => {
    await makeFriends(nadia, arif);

    await nadia.agent
      .delete('/api/users/me')
      .set('X-CSRF-Token', nadia.csrfToken)
      .send({ password: PASSWORD, confirm: 'DELETE' })
      .expect(204);

    expect((await as(arif).get('/api/friends')).body.data).toEqual([]);
    expect(await Friendship.countDocuments()).toBe(0);
    expect(await User.countDocuments({ status: 'active' })).toBe(1);
  });
});
