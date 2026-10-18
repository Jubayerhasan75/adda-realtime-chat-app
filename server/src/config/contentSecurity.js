// The browser security policy (docs/SECURITY.md §4), in one place for both hosts: Express
// sends it when it serves the app itself, and scripts/vercel-config.mjs writes the same policy
// into vercel.json when Vercel serves the app.

export const KLIPY_API_ORIGIN = 'https://api.klipy.com';
export const KLIPY_MEDIA_ORIGIN = 'https://static.klipy.com';
export const CLOUDINARY_UPLOAD_ORIGIN = 'https://api.cloudinary.com';
export const CLOUDINARY_MEDIA_ORIGIN = 'https://res.cloudinary.com';

/**
 * Content-Security-Policy directives (helmet's camelCase form). Only our own code runs; images
 * and video only from us and the media/GIF hosts; network requests only to us, the upload
 * host, KLIPY and (on Vercel) the chat server; the app can't be framed.
 * @param {{ mediaHosts?: string[], connectHosts?: string[], isHttps?: boolean }} options
 */
export function cspDirectives({ mediaHosts = [], connectHosts = [], isHttps = false } = {}) {
  return {
    defaultSrc: ["'self'"],
    // 'wasm-unsafe-eval' lets the app run WebAssembly (Argon2, which protects the encryption
    // key backup) and nothing else: JavaScript eval() and inline scripts stay blocked.
    scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'blob:', ...mediaHosts],
    mediaSrc: ["'self'", 'blob:', ...mediaHosts],
    fontSrc: ["'self'"],
    connectSrc: ["'self'", ...connectHosts],
    workerSrc: ["'self'"],
    manifestSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    ...(isHttps ? { upgradeInsecureRequests: [] } : {}),
  };
}

/** The same directives as a header value: "default-src 'self'; img-src …". */
export function cspHeaderValue(directives) {
  return Object.entries(directives)
    .map(([name, values]) => {
      const directive = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      return values.length ? `${directive} ${values.join(' ')}` : directive;
    })
    .join('; ');
}

export const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=()';
