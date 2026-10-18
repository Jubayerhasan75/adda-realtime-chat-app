import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSocketTickets } from '../../src/sockets/tickets.js';
import { connected, startLiveServer } from '../helpers/liveServer.js';
import {
  ORIGIN,
  clearDatabase,
  createTestApp,
  createVerifiedUser,
  silentLogger,
} from '../helpers/testApp.js';
import { startTestDatabase } from '../helpers/testDatabase.js';

let database;
let app;
let live;
let nadia;

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
  nadia = await createVerifiedUser(app, { username: 'nadia' });
});

afterEach(async () => {
  await live.close();
});

const getTicket = async (who) =>
  (await who.agent.post('/api/realtime/ticket').set('X-CSRF-Token', who.csrfToken).expect(200)).body
    .data.ticket;

/** Connects like the app on Vercel would: our Origin, no cookie, a ticket. */
const connectWithTicket = (ticket) => live.connect({ origin: ORIGIN, auth: { ticket } });

describe('one-time socket tickets (app and server on different sites)', () => {
  it('a ticket opens the live connection without any cookie', async () => {
    const socket = connectWithTicket(await getTicket(nadia));
    await expect(connected(socket)).resolves.toBeUndefined();
  });

  it('works only once', async () => {
    const ticket = await getTicket(nadia);
    await connected(connectWithTicket(ticket));
    await expect(connected(connectWithTicket(ticket))).rejects.toThrow('UNAUTHENTICATED');
  });

  it('refuses made-up tickets and tickets of a signed-out session', async () => {
    await expect(connected(connectWithTicket('x'.repeat(43)))).rejects.toThrow('UNAUTHENTICATED');

    const ticket = await getTicket(nadia);
    await nadia.agent.post('/api/auth/logout').set('X-CSRF-Token', nadia.csrfToken).expect(204);
    await expect(connected(connectWithTicket(ticket))).rejects.toThrow('UNAUTHENTICATED');
  });

  it('can only be requested by our own page while signed in', async () => {
    await nadia.agent.post('/api/realtime/ticket').expect(403); // no CSRF token
    await nadia.agent
      .post('/api/realtime/ticket')
      .set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', nadia.csrfToken)
      .expect(403);
    const { default: request } = await import('supertest');
    await request(app).post('/api/realtime/ticket').set('Origin', ORIGIN).expect(401);
  });

  it('a ticket presented from another website is refused', async () => {
    const socket = live.connect({
      origin: 'https://evil.example',
      auth: { ticket: await getTicket(nadia) },
    });
    await expect(connected(socket)).rejects.toThrow();
  });

  it('expires after a minute', () => {
    let time = 0;
    const tickets = createSocketTickets({ now: () => time });
    const { ticket } = tickets.issue('u1', 's1');
    time = 61_000;
    expect(tickets.redeem(ticket)).toBeNull();
    const fresh = tickets.issue('u1', 's1').ticket;
    expect(tickets.redeem(fresh)).toEqual({ userId: 'u1', sessionId: 's1' });
  });
});
