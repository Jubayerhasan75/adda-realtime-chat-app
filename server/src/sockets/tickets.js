import { randomBytes } from 'node:crypto';

const TICKET_TTL_MS = 60 * 1000;
const MAX_TICKETS = 10_000;

/**
 * One-time tickets for opening the live connection when the app and the server are on
 * different sites (Vercel + Render, docs/ARCHITECTURE.md §10): the browser can't send the
 * first-party session cookie to the socket server, so it first asks the API (same-site, with
 * the cookie and CSRF token) for a ticket. A ticket is random, works once, expires after
 * 60 seconds and is bound to that login session — revoking the session still disconnects it.
 * Kept in memory (single server instance in v1).
 */
export function createSocketTickets({ ttlMs = TICKET_TTL_MS, now = () => Date.now() } = {}) {
  const tickets = new Map();

  function sweep() {
    const time = now();
    for (const [ticket, entry] of tickets) {
      if (entry.expiresAt <= time) tickets.delete(ticket);
    }
  }

  return {
    issue(userId, sessionId) {
      if (tickets.size >= MAX_TICKETS) sweep();
      const ticket = randomBytes(32).toString('base64url');
      const expiresAt = now() + ttlMs;
      tickets.set(ticket, { userId: String(userId), sessionId: String(sessionId), expiresAt });
      return { ticket, expiresAt: new Date(expiresAt) };
    },

    /** The ticket's session (and removes it), or null if unknown, used or expired. */
    redeem(ticket) {
      if (typeof ticket !== 'string' || ticket.length > 100) return null;
      const entry = tickets.get(ticket);
      tickets.delete(ticket);
      if (!entry || entry.expiresAt <= now()) return null;
      return { userId: entry.userId, sessionId: entry.sessionId };
    },
  };
}
