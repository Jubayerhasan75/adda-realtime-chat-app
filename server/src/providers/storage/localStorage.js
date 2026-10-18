import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FORMAT_MIME_TYPES, sniffMedia } from '../../utils/sniffMedia.js';

const UPLOAD_TTL_MS = 10 * 60 * 1000;
const LINK_TTL_MS = 5 * 60 * 1000;
const SNIFF_BYTES = 64 * 1024;
const SAFE_NAME = /^[\w-]{1,200}$/;

/**
 * Development/test storage: files are kept in a folder on this computer and served by our own
 * server through short-lived signed links, mimicking Cloudinary's flow (signed upload → verify →
 * signed delivery). Refused in production by env.js, because hosting disks are wiped on deploy.
 * @param {{ dir: string }} options
 */
export function createLocalStorage({ dir }) {
  // A fresh secret per process: links simply stop working after a restart, which is fine here.
  const secret = randomBytes(32);
  const mac = (value) => createHmac('sha256', secret).update(value).digest('base64url');
  const fileName = (key) => key.replaceAll('/', '_');

  function sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${mac(body)}`;
  }

  function verify(token) {
    const [body, signature = ''] = String(token).split('.');
    const expected = Buffer.from(mac(body ?? ''));
    const given = Buffer.from(signature);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  }

  return {
    name: 'local',
    origins: { upload: [], media: [] },

    async prepareUpload({ key, maxBytes }) {
      const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS);
      return {
        url: '/api/media/local-upload',
        fields: { token: sign({ key, maxBytes, exp: expiresAt.getTime() }) },
        expiresAt,
      };
    },

    /**
     * Stores an uploaded file (POST /api/media/local-upload).
     * @returns {Promise<'stored' | 'invalid_token' | 'too_large'>}
     * @param {string} token
     * @param {Blob} file
     */
    async acceptUpload(token, file) {
      const payload = verify(token);
      if (!payload) return 'invalid_token';
      if (file.size > payload.maxBytes) return 'too_large';
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, fileName(payload.key)), Buffer.from(await file.arrayBuffer()));
      return 'stored';
    },

    async inspect({ key }) {
      const file = path.join(dir, fileName(key));
      let handle;
      try {
        handle = await open(file, 'r');
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
      try {
        const { size } = await stat(file);
        const { buffer, bytesRead } = await handle.read(
          Buffer.alloc(SNIFF_BYTES),
          0,
          SNIFF_BYTES,
          0,
        );
        const sniffed = sniffMedia(buffer.subarray(0, bytesRead));
        return {
          bytes: size,
          format: sniffed?.format ?? 'unknown',
          width: sniffed?.width ?? null,
          height: sniffed?.height ?? null,
          durationMs: null,
        };
      } finally {
        await handle.close();
      }
    },

    async remove({ key }) {
      await rm(path.join(dir, fileName(key)), { force: true });
    },

    /** Local storage has no video posters or resizing: every variant is the original file. */
    deliveryUrl({ key, kind, variant }) {
      if (kind === 'video' && variant !== 'full') return null;
      const exp = Date.now() + LINK_TTL_MS;
      const name = fileName(key);
      return `/api/media/local-file/${name}?exp=${exp}&sig=${mac(`${name}:${exp}`)}`;
    },

    /** Serves a file for a valid, unexpired signed link (GET /api/media/local-file/:name). */
    async readSigned(name, exp, sig) {
      if (!SAFE_NAME.test(name) || !(Number(exp) > Date.now())) return null;
      const expected = Buffer.from(mac(`${name}:${exp}`));
      const given = Buffer.from(String(sig ?? ''));
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      try {
        const data = await readFile(path.join(dir, name));
        const format = sniffMedia(data.subarray(0, SNIFF_BYTES))?.format;
        return { data, mimeType: FORMAT_MIME_TYPES[format] ?? 'application/octet-stream' };
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
    },
  };
}
