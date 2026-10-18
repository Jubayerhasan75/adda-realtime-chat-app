import { CLIENT_EVENTS, SERVER_EVENTS, SOCKET_ERRORS } from '@chat/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { createSocket } from '../../lib/socket.js';
import { SESSION_KEY } from '../auth/api.js';
import { CHAT_KEYS, insertMessage, removeMessage, upsertMessage } from '../chat/api.js';
import { flushOutbox, startOutbox, stopOutbox } from '../chat/outbox.js';
import { clearTyping, receiveTyping } from '../chat/typingStore.js';
import { FRIENDS_KEYS } from '../friends/api.js';
import { NOTIFICATIONS_KEY } from '../notifications/api.js';
import { forgetGroupBoxKeys, forgetGroupKeys, shareGroupKeys } from '../e2ee/groupKeys.js';
import { forgetPeerKeys } from '../e2ee/keyring.js';
import { openMessage } from '../e2ee/messages.js';
import { syncPushSubscription } from '../pwa/push.js';
import { clearPresence, setPresenceSnapshot, updatePresence } from './presenceStore.js';
import { setConnected, setSocket } from './socketStore.js';

/**
 * Keeps one live connection open while a verified user is signed in. Server events either carry
 * the new data (messages, typing) or are hints to refetch from the REST API, which stays the
 * source of truth (docs/ARCHITECTURE.md §2). Also runs the outbox of unsent messages.
 */
export function RealtimeConnection({ userId }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = createSocket();
    const refreshConversations = () =>
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversations });
    setSocket(socket);

    startOutbox(userId, {
      onMessageSent: (message) => {
        insertMessage(queryClient, message);
        refreshConversations();
      },
    });

    // Events missed while disconnected are recovered from REST: reload the newest page of each
    // open history (older cached pages could otherwise leave a gap) and every list.
    const catchUp = () => {
      queryClient.resetQueries({ queryKey: CHAT_KEYS.messages });
      refreshConversations();
      queryClient.invalidateQueries({ queryKey: FRIENDS_KEYS.all });
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    };
    let connectedBefore = false;
    socket.on('connect', () => {
      setConnected(true);
      // Messages that arrived between loading the list and connecting are picked up now
      // (and reported as delivered); after a reconnect, everything missed is reloaded.
      if (connectedBefore) catchUp();
      else refreshConversations();
      connectedBefore = true;
      flushOutbox();
    });
    // Messages arrive encrypted; they are decrypted on this device before being shown.
    socket.on(SERVER_EVENTS.MESSAGE_NEW, async ({ message }) => {
      if (message.senderId !== userId) clearTyping(message.conversationId);
      insertMessage(queryClient, await openMessage(message));
      refreshConversations();
    });
    socket.on(SERVER_EVENTS.MESSAGE_UPDATED, async ({ message }) => {
      upsertMessage(queryClient, await openMessage(message));
      refreshConversations(); // previews, unread counts and pins may change
    });
    // A friend set up a new key: use it from now on (and re-read anything that needs it).
    socket.on(SERVER_EVENTS.KEYS_UPDATED, ({ userId: changedUserId }) => {
      forgetPeerKeys(changedUserId);
      forgetGroupBoxKeys();
      queryClient.invalidateQueries({ queryKey: ['keys', changedUserId] });
    });
    socket.on(SERVER_EVENTS.MESSAGE_HIDDEN, ({ conversationId, messageId }) => {
      removeMessage(queryClient, conversationId, messageId);
      refreshConversations();
    });
    socket.on(SERVER_EVENTS.CONVERSATION_UPDATED, ({ conversationId }) => {
      // Cleared, muted or recolored on another of my devices; or a group changed (members,
      // name, a new group key, keys shared with me): load its keys and messages again.
      forgetGroupKeys(conversationId);
      queryClient.resetQueries({ queryKey: CHAT_KEYS.history(conversationId) });
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversation(conversationId) });
      refreshConversations();
    });
    // I left or was removed from a group: it disappears.
    socket.on(SERVER_EVENTS.CONVERSATION_REMOVED, ({ conversationId }) => {
      forgetGroupKeys(conversationId);
      queryClient.setQueryData(CHAT_KEYS.list, (list) =>
        list?.filter((conversation) => conversation.id !== conversationId),
      );
      queryClient.removeQueries({ queryKey: CHAT_KEYS.history(conversationId) });
      queryClient.invalidateQueries({ queryKey: CHAT_KEYS.conversation(conversationId) });
      refreshConversations();
    });
    // Someone in a group is missing keys: share mine (after a short random wait, so not every
    // member's phone answers at once — the server keeps the first good copy).
    socket.on(SERVER_EVENTS.GROUP_KEYS_NEEDED, ({ conversationId, userId: needy }) => {
      setTimeout(
        () => shareGroupKeys(conversationId, [needy]).catch(() => {}),
        Math.random() * 2000,
      );
    });
    socket.on(SERVER_EVENTS.RECEIPT_UPDATE, refreshConversations);
    socket.on(SERVER_EVENTS.CONVERSATION_READ_SYNC, refreshConversations);
    socket.on(SERVER_EVENTS.TYPING_UPDATE, receiveTyping);
    socket.on(SERVER_EVENTS.PRESENCE_SNAPSHOT, ({ users }) => setPresenceSnapshot(users));
    socket.on(SERVER_EVENTS.PRESENCE_UPDATE, updatePresence);
    socket.on(SERVER_EVENTS.FRIENDSHIP_UPDATED, () => {
      queryClient.invalidateQueries({ queryKey: FRIENDS_KEYS.all });
      refreshConversations(); // "can message" may have changed
      socket.emit(CLIENT_EVENTS.PRESENCE_REFRESH, {}); // whose presence I may see changed
    });
    socket.on(SERVER_EVENTS.NOTIFICATION_NEW, () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    });
    socket.on('disconnect', (reason) => {
      setConnected(false);
      // The server ends a connection when its login session ends (logout elsewhere, revoked,
      // password changed): re-check the session, which sends the user to login if it's gone.
      // Our own logout also closes the connection; that case is handled by the logout itself.
      const signingOut = queryClient.getQueryData(SESSION_KEY)?.signingOut;
      if (reason === 'io server disconnect' && !signingOut) {
        queryClient.invalidateQueries({ queryKey: SESSION_KEY });
      }
    });
    socket.on('connect_error', (error) => {
      if (error.message === SOCKET_ERRORS.UNAUTHENTICATED) {
        socket.disconnect();
        queryClient.invalidateQueries({ queryKey: SESSION_KEY });
      }
    });
    // The phone says it lost/regained the network: react now instead of waiting up to ~45 s
    // for the connection's heartbeat to time out.
    const goOffline = () => socket.disconnect();
    const goOnline = () => {
      if (!socket.connected) socket.connect();
      flushOutbox();
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    // This device's notifications follow whoever is signed in on it.
    syncPushSubscription();
    // The app is open: clear the "new messages" dot on the app icon.
    navigator.clearAppBadge?.().catch(() => {});

    // "Online" means the app is on screen: report when it's hidden or shown again.
    const reportVisibility = () => {
      if (document.visibilityState === 'visible') navigator.clearAppBadge?.().catch(() => {});
      if (socket.connected) {
        socket.emit(CLIENT_EVENTS.PRESENCE_VISIBILITY, {
          visible: document.visibilityState === 'visible',
        });
      }
    };
    document.addEventListener('visibilitychange', reportVisibility);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      document.removeEventListener('visibilitychange', reportVisibility);
      clearPresence();
      stopOutbox();
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      setSocket(null);
    };
  }, [userId, queryClient]);

  return null;
}
