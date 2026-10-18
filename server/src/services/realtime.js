/**
 * The only place that talks to Socket.IO (docs/ARCHITECTURE.md §4–5). Business code calls these
 * functions without knowing about rooms. Every socket joins exactly two server-controlled rooms:
 * `user:<id>` and `session:<id>`; clients can never join rooms themselves.
 *
 * Without an attached server (e.g. API-only tests) every call is a harmless no-op.
 */
let io = null;

/** @param {import('socket.io').Server | null} server */
export function attachRealtime(server) {
  io = server;
}

export const userRoom = (userId) => `user:${userId}`;
export const sessionRoom = (sessionId) => `session:${sessionId}`;

/** Sends an event to every connected device of a user. */
export function emitToUser(userId, event, payload) {
  io?.to(userRoom(userId)).emit(event, payload);
}

/**
 * Disconnects every socket that belongs to the given login sessions (logout, revoke, password
 * change, account deletion). Clients see the "io server disconnect" reason and re-check their
 * session, which then sends them to the login page.
 */
export function endSessions(sessionIds) {
  if (!io) return;
  for (const sessionId of sessionIds) {
    io.in(sessionRoom(sessionId)).disconnectSockets();
  }
}
