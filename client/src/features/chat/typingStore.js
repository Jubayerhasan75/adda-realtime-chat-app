import { CLIENT_EVENTS } from '@chat/shared';
import { useSyncExternalStore } from 'react';
import { getConnectedSocket } from '../realtime/socketStore.js';

/** Receivers drop "typing…" if it isn't refreshed, so a lost "stop" can't stick forever. */
const TYPING_EXPIRY_MS = 6_000;
const SEND_INTERVAL_MS = 3_000;
const IDLE_STOP_MS = 5_000;

const typingTimers = new Map(); // conversationId → expiry timer
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Called for every `typing:update` from the server. */
export function receiveTyping({ conversationId, isTyping }) {
  clearTimeout(typingTimers.get(conversationId));
  if (isTyping) {
    typingTimers.set(
      conversationId,
      setTimeout(() => clearTyping(conversationId), TYPING_EXPIRY_MS),
    );
  } else {
    typingTimers.delete(conversationId);
  }
  emit();
}

/** Clears an indicator (expired, or the person's message arrived). */
export function clearTyping(conversationId) {
  clearTimeout(typingTimers.get(conversationId));
  if (typingTimers.delete(conversationId)) emit();
}

/** True while the other person is typing in this conversation. */
export function useIsTyping(conversationId) {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => typingTimers.has(conversationId),
  );
}

/**
 * Sends my own typing state: at most one "start" every 3 s while typing, and "stop" after
 * 5 s without a keystroke, on send, or when leaving the conversation.
 */
export function createTypingNotifier(conversationId) {
  let lastStartAt = 0;
  let idleTimer = null;
  let typing = false;

  const send = (event) => getConnectedSocket()?.emit(event, { conversationId });

  const stop = () => {
    clearTimeout(idleTimer);
    if (!typing) return;
    typing = false;
    lastStartAt = 0;
    send(CLIENT_EVENTS.TYPING_STOP);
  };

  return {
    keystroke() {
      const now = Date.now();
      if (now - lastStartAt > SEND_INTERVAL_MS) {
        lastStartAt = now;
        typing = true;
        send(CLIENT_EVENTS.TYPING_START);
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(stop, IDLE_STOP_MS);
    },
    stop,
  };
}
