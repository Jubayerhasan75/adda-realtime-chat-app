import { apiRequest } from '../../lib/http.js';
import { isIos, isStandalone } from './pwaStore.js';

/**
 * What notifications can do on this device:
 * - 'unsupported': this browser has no Web Push;
 * - 'needs-install': iPhone/iPad Safari — only an app added to the Home Screen can get them;
 * - 'denied' / 'default' / 'granted': the browser's permission.
 */
export function pushStatus() {
  if (isIos() && !isStandalone()) return 'needs-install';
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported';
  }
  return Notification.permission;
}

function base64UrlToBytes(value) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
    .replaceAll('-', '+')
    .replaceAll('_', '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function serviceWorker() {
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('The app is still starting. Try again in a moment.')),
        10_000,
      ),
    ),
  ]);
  return registration;
}

/** Gets (or creates) this browser's subscription and stores it for the current login session. */
async function subscribeAndSave() {
  const { publicKey } = await apiRequest('/api/notifications/vapid-public-key');
  if (!publicKey) throw new Error('Notifications aren’t set up on the server yet.');
  const registration = await serviceWorker();
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(publicKey),
    }));
  await apiRequest('/api/notifications/subscriptions', {
    method: 'POST',
    body: subscription.toJSON(),
  });
}

/** "Turn on notifications" — must run from a tap (browsers only ask then). */
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  await subscribeAndSave();
  return 'granted';
}

/** Stop notifications on this device only (other devices keep theirs). */
export async function disablePushOnThisDevice() {
  const registration = await serviceWorker();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await apiRequest('/api/notifications/subscriptions', {
    method: 'DELETE',
    body: { endpoint: subscription.endpoint },
  }).catch(() => {});
  await subscription.unsubscribe();
}

/** Whether this device currently has a push subscription. */
export async function hasPushSubscription() {
  if (pushStatus() !== 'granted') return false;
  const registration = await navigator.serviceWorker.getRegistration();
  return Boolean(await registration?.pushManager.getSubscription());
}

/**
 * On every start while signed in: if notifications are allowed, make sure the server has this
 * device's subscription for the current login (it is removed at logout, and browsers sometimes
 * replace subscriptions).
 */
export async function syncPushSubscription() {
  if (pushStatus() !== 'granted') return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration || !(await registration.pushManager.getSubscription())) return;
  await subscribeAndSave().catch(() => {});
}
