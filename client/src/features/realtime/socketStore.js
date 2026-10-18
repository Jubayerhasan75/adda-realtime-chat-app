import { useSyncExternalStore } from 'react';

/**
 * Holds the tab's single Socket.IO connection (created by RealtimeConnection) so features can
 * send events and show connection status without owning the socket themselves.
 */
let currentSocket = null;
let connected = false;
const listeners = new Set();

function notify() {
  listeners.forEach((listener) => listener());
}

export function setSocket(socket) {
  currentSocket = socket;
  connected = Boolean(socket?.connected);
  notify();
}

export function setConnected(value) {
  connected = value;
  notify();
}

/** The live socket if it is connected, otherwise null (callers then fall back to REST). */
export function getConnectedSocket() {
  return connected ? currentSocket : null;
}

/** Re-renders when the connection goes up or down. */
export function useIsConnected() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => connected,
  );
}
