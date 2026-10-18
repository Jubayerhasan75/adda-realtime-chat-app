import http from 'node:http';
import { io as connectClient } from 'socket.io-client';
import { attachRealtime } from '../../src/services/realtime.js';
import { attachSocketServer } from '../../src/sockets/index.js';
import { ORIGIN, silentLogger } from './testApp.js';

/** Runs the app with Socket.IO on a random local port, like the real server. */
export async function startLiveServer(app) {
  const server = http.createServer(app);
  const io = attachSocketServer(server, {
    env: app.locals.env,
    logger: silentLogger,
    sessionCookie: app.locals.sessionCookie,
    services: app.locals.services,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];

  return {
    url,
    /** Opens a socket like a browser tab would (cookie + our Origin unless overridden). */
    connect({ cookie, origin = ORIGIN, auth } = {}) {
      const headers = {};
      if (cookie) headers.Cookie = cookie;
      if (origin) headers.Origin = origin;
      const socket = connectClient(url, {
        path: '/socket.io',
        transports: ['websocket'],
        extraHeaders: headers,
        reconnection: false,
        forceNew: true,
        ...(auth ? { auth } : {}),
      });
      clients.push(socket);
      return socket;
    },
    async close() {
      clients.forEach((socket) => socket.close());
      attachRealtime(null);
      await new Promise((resolve) => io.close(() => resolve()));
    },
  };
}

/** Resolves when the socket connects, rejects with the server's reason if it is refused. */
export function connected(socket) {
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

/** Resolves with the next payload of `event` (fails the test after `ms`). */
export function nextEvent(socket, event, ms = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), ms);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}
