/** Private home/office network addresses (192.168.x.x, 10.x.x.x, 172.16–31.x.x). */
const PRIVATE_IPV4 = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
];

/**
 * Which browser origins may call the API and open sockets: only APP_ORIGIN — plus, in
 * development only, the same dev server opened from a phone on the same Wi-Fi
 * (http://192.168.x.x:5173 from `npm run dev:phone`), so the app can be tried on a real device.
 * @param {import('./env.js').Env} env
 * @returns {(origin: string | null | undefined) => boolean}
 */
export function createOriginCheck(env) {
  const appPort = new URL(env.APP_ORIGIN).port;
  const allowLan = env.NODE_ENV === 'development';

  return (origin) => {
    if (!origin) return false;
    if (origin === env.APP_ORIGIN) return true;
    if (!allowLan) return false;
    try {
      const url = new URL(origin);
      return (
        url.protocol === 'http:' &&
        url.port === appPort &&
        url.origin === origin &&
        PRIVATE_IPV4.some((pattern) => pattern.test(url.hostname))
      );
    } catch {
      return false;
    }
  };
}
