import { useSyncExternalStore } from 'react';

const TOAST_MS = 2500;
let current = null;
let timer = null;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Shows a short, non-blocking confirmation such as "Copied". */
export function showToast(message) {
  clearTimeout(timer);
  current = { message, id: Date.now() };
  emit();
  timer = setTimeout(() => {
    current = null;
    emit();
  }, TOAST_MS);
}

/** The toast currently shown, or null. */
export function useCurrentToast() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
