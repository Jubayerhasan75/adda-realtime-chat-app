import { describe, expect, it } from 'vitest';
import { buildVercelConfig } from '../../../scripts/vercel-config.mjs';

const header = (config, source, key) =>
  config.headers.find((rule) => rule.source === source)?.headers.find((h) => h.key === key)?.value;

describe('vercel.json for the Vercel + Render setup', () => {
  const config = buildVercelConfig('https://adda-api.onrender.com');

  it('forwards /api to the chat server first, and every other page to the app', () => {
    expect(config.rewrites).toEqual([
      { source: '/api/:path*', destination: 'https://adda-api.onrender.com/api/:path*' },
      { source: '/(.*)', destination: '/index.html' },
    ]);
  });

  it('applies the strict security policy, allowing only the chat server and media hosts', () => {
    const csp = header(config, '/(.*)', 'Content-Security-Policy');
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain(
      "connect-src 'self' https://adda-api.onrender.com wss://adda-api.onrender.com https://api.cloudinary.com https://api.klipy.com",
    );
    expect(csp).toContain(
      "img-src 'self' data: blob: https://res.cloudinary.com https://static.klipy.com",
    );
    expect(csp).toContain('upgrade-insecure-requests');
    // Only WebAssembly is allowed; never eval() or inline scripts/styles.
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(header(config, '/(.*)', 'Strict-Transport-Security')).toContain('max-age=31536000');
    expect(header(config, '/(.*)', 'X-Frame-Options')).toBe('DENY');
  });

  it('never lets the service worker or app shell be cached (updates must arrive)', () => {
    for (const path of ['/sw.js', '/index.html', '/manifest.webmanifest']) {
      expect(header(config, path, 'Cache-Control')).toBe('no-cache');
    }
    expect(header(config, '/assets/(.*)', 'Cache-Control')).toContain('immutable');
  });

  it('refuses a non-https or malformed server address', () => {
    expect(() => buildVercelConfig('http://adda-api.onrender.com')).toThrow();
    expect(() => buildVercelConfig('https://adda-api.onrender.com/api')).toThrow();
  });
});
