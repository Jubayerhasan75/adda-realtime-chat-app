// Writes vercel.json for the Vercel + Render setup (docs/ARCHITECTURE.md §10):
//   node scripts/vercel-config.mjs https://adda-api.onrender.com
// Vercel serves the built app and forwards /api to the chat server, so the login cookie stays
// first-party. The same security headers Express uses are applied to every page.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CLOUDINARY_MEDIA_ORIGIN,
  CLOUDINARY_UPLOAD_ORIGIN,
  KLIPY_API_ORIGIN,
  KLIPY_MEDIA_ORIGIN,
  PERMISSIONS_POLICY,
  cspDirectives,
  cspHeaderValue,
} from '../server/src/config/contentSecurity.js';

/** @param {string} apiUrl the chat server's https address (Render) */
export function buildVercelConfig(apiUrl) {
  const api = new URL(apiUrl);
  if (api.protocol !== 'https:' || api.pathname !== '/' || api.search) {
    throw new Error('The server address must be like https://adda-api.onrender.com');
  }
  const socketOrigin = `wss://${api.host}`;
  const csp = cspHeaderValue(
    cspDirectives({
      mediaHosts: [CLOUDINARY_MEDIA_ORIGIN, KLIPY_MEDIA_ORIGIN],
      connectHosts: [
        api.origin,
        socketOrigin,
        CLOUDINARY_UPLOAD_ORIGIN,
        CLOUDINARY_MEDIA_ORIGIN,
        KLIPY_API_ORIGIN,
      ],
      isHttps: true,
    }),
  );
  const noCache = [{ key: 'Cache-Control', value: 'no-cache' }];

  return {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    framework: null,
    installCommand: 'npm ci',
    buildCommand: 'npm run build -w client',
    outputDirectory: 'client/dist',
    rewrites: [
      { source: '/api/:path*', destination: `${api.origin}/api/:path*` },
      // Every other page is the app (files like /assets/… are served before this applies).
      { source: '/(.*)', destination: '/index.html' },
    ],
    headers: [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      {
        source: '/assets/(.*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // The service worker and app shell must always be checked, or updates wouldn't arrive.
      { source: '/sw.js', headers: noCache },
      { source: '/index.html', headers: noCache },
      { source: '/manifest.webmanifest', headers: noCache },
    ],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const apiUrl = process.argv[2];
  if (!apiUrl) {
    process.stderr.write('Usage: node scripts/vercel-config.mjs https://<server>.onrender.com\n');
    process.exit(1);
  }
  const target = fileURLToPath(new URL('../vercel.json', import.meta.url));
  writeFileSync(target, `${JSON.stringify(buildVercelConfig(apiUrl), null, 2)}\n`);
  process.stdout.write(`Wrote vercel.json (API: ${new URL(apiUrl).origin})\n`);
}
