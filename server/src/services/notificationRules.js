/**
 * Who gets a push notification, and what it says (docs/REQUIREMENTS.md D10). Pure functions,
 * so every rule is unit-tested. `null` = don't send.
 */

const APP_NAME = 'Adda';

// Push services limit payloads to about 4 KB; the encrypted message is only included when it
// comfortably fits (the notification then just says "New message").
const MAX_ENCRYPTED_PAYLOAD = 3000;

/**
 * A new message for `recipient`. Not sent when notifications are off, the chat is muted, or
 * the recipient has the app open on screen (they see it there; also avoids duplicates).
 * The preview setting decides how much the lock screen shows. The server can't read messages
 * (docs/E2EE.md §6): for "name and message" it passes the encrypted envelope along, and the
 * phone's service worker decrypts it to show the text.
 */
export function messageNotification({ recipient, sender, message, mutedUntil, appOnScreen, now }) {
  const prefs = recipient.settings?.notifications ?? {};
  if (prefs.enabled === false) return null;
  if (mutedUntil && mutedUntil > now) return null;
  if (appOnScreen) return null;

  const conversationId = String(message.conversationId);
  const base = { tag: `chat-${conversationId}`, url: `/chats/${conversationId}` };
  switch (prefs.preview ?? 'name_only') {
    case 'name_and_text': {
      const notification = { ...base, title: sender.displayName, body: 'New message' };
      const encrypted = {
        conversationId,
        senderId: String(message.senderId),
        clientMessageId: message.clientMessageId,
        envelope: message.envelope,
      };
      return message.envelope && JSON.stringify(encrypted).length <= MAX_ENCRYPTED_PAYLOAD
        ? { ...notification, encrypted }
        : notification;
    }
    case 'none':
      return { ...base, title: APP_NAME, body: 'New message' };
    default:
      return { ...base, title: sender.displayName, body: 'New message' };
  }
}

/** Friend request / accepted, unless switched off. Names follow the preview setting. */
export function friendNotification({ recipient, actor, type }) {
  const prefs = recipient.settings?.notifications ?? {};
  if (prefs.enabled === false || prefs.friendRequests === false) return null;
  const hideName = prefs.preview === 'none';
  const who = hideName ? 'Someone' : actor.displayName;
  if (type === 'friend_request') {
    return {
      tag: 'friend-requests',
      url: '/friends',
      title: hideName ? APP_NAME : 'Friend request',
      body: `${who} sent you a friend request`,
    };
  }
  if (type === 'friend_accepted') {
    return {
      tag: 'friend-requests',
      url: '/friends',
      title: hideName ? APP_NAME : 'New friend',
      body: `${who} accepted your friend request`,
    };
  }
  return null;
}
