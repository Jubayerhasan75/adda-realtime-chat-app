/* Service worker (docs/ARCHITECTURE.md §11). Built by vite-plugin-pwa (injectManifest). */
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

// Only the app's own files (hashed JS/CSS, fonts, icons, index.html) are stored on the device.
// /api, /socket.io and media are never handled here, so they always go to the network and
// private data never lands in Cache Storage.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Opening any page of the app (also offline) starts from the stored app shell.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/socket\.io\//],
  }),
);

// A new version waits until the user taps "Reload" (never mid-conversation by itself).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── Push notifications (docs/ARCHITECTURE.md §11) ─────────────────────────────────────────

function readPush(event) {
  try {
    return event.data?.json() ?? {};
  } catch {
    return {};
  }
}

// Every push shows a notification (iPhones revoke subscriptions that don't). The server only
// pushes when the app isn't on screen. One notification per chat: a newer one replaces it.
self.addEventListener('push', (event) => {
  const data = readPush(event);
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || 'Adda', {
        body: data.body || 'New message',
        tag: data.tag,
        renotify: Boolean(data.tag),
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        data: { url: data.url || '/chats' },
      }),
      // App-icon badge where supported (installed app on Android/desktop/iOS).
      self.navigator.setAppBadge?.().catch(() => {}),
    ]),
  );
});

// Tapping a notification opens that chat: in the app if it's already open, else a new window.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = new URL(event.notification.data?.url || '/chats', self.location.origin).pathname;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: 'open', path });
        return;
      }
      await self.clients.openWindow(path);
    })(),
  );
});
