import { isIPv4, isIPv6 } from 'node:net';

/**
 * Truncates an IP address (IPv4 → /24, IPv6 → /48): enough to recognise a network in the
 * sessions list, not enough to identify a household.
 */
export function ipPrefix(ip = '') {
  const address = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIPv4(address)) return `${address.split('.').slice(0, 3).join('.')}.0/24`;
  if (isIPv6(address)) {
    const groups = address.split(':');
    return `${groups.slice(0, 3).join(':')}::/48`;
  }
  return '';
}

/** @param {import('express').Request} req */
export function requestInfo(req) {
  return {
    ipPrefix: ipPrefix(req.ip),
    userAgent: String(req.get('user-agent') ?? '').slice(0, 200),
  };
}

const BROWSERS = [
  [/Edg\//, 'Edge'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];
const SYSTEMS = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

/** "Chrome on Android" style label for the sessions list. */
export function describeUserAgent(userAgent = '') {
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? 'Unknown device';
}
