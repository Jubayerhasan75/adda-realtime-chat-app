/**
 * Socket.IO event names (docs/API.md §3). Server and client import these constants so a typo
 * can never silently break real-time updates.
 */
export const SERVER_EVENTS = Object.freeze({
  FRIENDSHIP_UPDATED: 'friendship:updated',
  NOTIFICATION_NEW: 'notification:new',
  MESSAGE_NEW: 'message:new',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_HIDDEN: 'message:hidden',
  RECEIPT_UPDATE: 'receipt:update',
  CONVERSATION_READ_SYNC: 'conversation:read-sync',
  CONVERSATION_UPDATED: 'conversation:updated',
  TYPING_UPDATE: 'typing:update',
  // Online / last seen of my friends: the full picture on connect, then changes.
  PRESENCE_SNAPSHOT: 'presence:snapshot',
  PRESENCE_UPDATE: 'presence:update',
  // A friend's encryption key changed (new device setup or reset): refetch and warn.
  KEYS_UPDATED: 'keys:updated',
  // I'm no longer in this conversation (left or removed from a group): drop it.
  CONVERSATION_REMOVED: 'conversation:removed',
  // A group member is missing group keys: a member's device that has them should share them.
  GROUP_KEYS_NEEDED: 'group:keys-needed',
});

/** Events the client sends; each one is answered through a Socket.IO acknowledgement. */
export const CLIENT_EVENTS = Object.freeze({
  MESSAGE_SEND: 'message:send',
  MESSAGE_DELIVERED: 'message:delivered',
  CONVERSATION_READ: 'conversation:read',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  // Whether this tab/app is on screen; only visible devices count as "online".
  PRESENCE_VISIBILITY: 'presence:visibility',
  // Ask for a fresh presence snapshot (e.g. after a friendship or privacy change).
  PRESENCE_REFRESH: 'presence:refresh',
});

/** Reasons sent with a failed handshake (`connect_error` → `err.message`). */
export const SOCKET_ERRORS = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
});
