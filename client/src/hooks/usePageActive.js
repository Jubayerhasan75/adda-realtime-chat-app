import { useSyncExternalStore } from 'react';

const EVENTS = ['visibilitychange', 'focus', 'blur'];

function subscribe(onChange) {
  EVENTS.forEach((event) => window.addEventListener(event, onChange));
  document.addEventListener('visibilitychange', onChange);
  return () => {
    EVENTS.forEach((event) => window.removeEventListener(event, onChange));
    document.removeEventListener('visibilitychange', onChange);
  };
}

/**
 * True only while the page is visible *and* focused — the user is actually looking at it.
 * A connected but hidden tab must never send "seen" receipts (docs/ARCHITECTURE.md §6).
 */
export function usePageActive() {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState === 'visible' && document.hasFocus(),
  );
}
