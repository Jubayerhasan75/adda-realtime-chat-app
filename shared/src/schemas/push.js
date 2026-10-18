import { z } from 'zod';

/**
 * Browsers' push services. A subscription must point at one of them, so the server never sends
 * requests to an arbitrary address (no server-side request forgery).
 */
export const PUSH_SERVICE_HOSTS = Object.freeze([
  'fcm.googleapis.com', // Chrome, Android, most Chromium browsers
  'android.googleapis.com',
  'push.services.mozilla.com', // Firefox (updates.push.services.mozilla.com)
  'push.apple.com', // Safari on iPhone, iPad and Mac (web.push.apple.com)
  'notify.windows.com', // Edge on Windows (*.notify.windows.com)
]);

export function isPushServiceUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (url.port === '' || url.port === '443') &&
      PUSH_SERVICE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    );
  } catch {
    return false;
  }
}

const base64url = (min, max) =>
  z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${min},${max}}={0,2}$`), 'Invalid key');

const endpointField = z.string().max(1000).refine(isPushServiceUrl, 'Unsupported push service');

export const pushSubscriptionSchema = z.object({
  endpoint: endpointField,
  // Browsers also send expirationTime; it is accepted and ignored.
  expirationTime: z.number().nullable().optional(),
  keys: z.strictObject({ p256dh: base64url(80, 100), auth: base64url(16, 30) }),
});

export const pushUnsubscribeSchema = z.strictObject({ endpoint: endpointField });
