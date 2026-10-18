import { useSyncExternalStore } from 'react';

/**
 * Friends' online status and last seen, as the server allows me to see them:
 * userId → { online: boolean | null, lastSeenAt: string | null } (null = hidden by privacy).
 * Filled by `presence:snapshot` on every (re)connect and kept current by `presence:update`.
 */
let presence = new Map();
const listeners = new Set();

const notify = () => listeners.forEach((listener) => listener());

export function setPresenceSnapshot(users) {
  presence = new Map(users.map((user) => [user.userId, user]));
  notify();
}

export function updatePresence(user) {
  presence = new Map(presence).set(user.userId, user);
  notify();
}

export function clearPresence() {
  presence = new Map();
  notify();
}

const HIDDEN = Object.freeze({ online: null, lastSeenAt: null });

/** What I may see of one person (nothing for strangers, hidden values, or before connecting). */
export function usePresence(userId) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (userId && presence.get(userId)) || HIDDEN,
  );
}
