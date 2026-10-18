import { io } from 'socket.io-client';
import { apiRequest } from './http.js';

// Set on Vercel (VITE_SOCKET_URL=https://<server>.onrender.com): the live connection goes
// straight to the chat server, because Vercel can't forward WebSockets. Empty in development
// and when one server serves everything (same site).
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined;

/**
 * One Socket.IO connection per browser tab, created after sign-in and closed on sign-out.
 * Same site: the HttpOnly session cookie authenticates it. Other site: a one-time ticket from
 * the API (which does have the cookie) — docs/ARCHITECTURE.md §10.
 * @returns {import('socket.io-client').Socket}
 */
export function createSocket() {
  const crossSite = Boolean(SOCKET_URL);
  return io(SOCKET_URL, {
    path: '/socket.io',
    withCredentials: !crossSite,
    // Exponential back-off between reconnects keeps a sleeping free-tier server from being hammered.
    reconnectionDelay: 1000,
    reconnectionDelayMax: 15_000,
    // Re-read on every (re)connect: only an app that is on screen counts as "online".
    auth: async (send) => {
      const visible = document.visibilityState === 'visible';
      if (!crossSite) {
        send({ visible });
        return;
      }
      try {
        const { ticket } = await apiRequest('/api/realtime/ticket', { method: 'POST' });
        send({ visible, ticket });
      } catch {
        send({ visible }); // refused as signed out; the app then re-checks the session
      }
    },
  });
}
