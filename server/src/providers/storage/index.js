import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCloudinaryStorage } from './cloudinaryStorage.js';
import { createLocalStorage } from './localStorage.js';

/**
 * @typedef {{
 *   name: string,
 *   origins: { upload: string[], media: string[] },
 *   prepareUpload(file: { key: string, kind: 'image'|'video', maxBytes: number }): Promise<{ url: string, fields: Record<string, string|number>, expiresAt: Date }>,
 *   inspect(file: { key: string, kind: string }): Promise<{ bytes: number, format: string, width: number|null, height: number|null, durationMs: number|null } | null>,
 *   remove(file: { key: string, kind: string }): Promise<void>,
 *   deliveryUrl(file: { key: string, kind: string, variant: string }): string | null,
 * }} Storage
 */

const DEV_MEDIA_DIR = fileURLToPath(new URL('../../../.media', import.meta.url));

/**
 * The configured media storage (env MEDIA_STORAGE), or null when uploads are disabled.
 * Swappable: any object with the Storage shape works (docs/ARCHITECTURE.md §9).
 * @param {import('../../config/env.js').Env} env
 * @returns {Storage | null}
 */
export function createStorage(env) {
  if (env.MEDIA_STORAGE === 'cloudinary')
    return createCloudinaryStorage({ url: env.CLOUDINARY_URL });
  if (env.MEDIA_STORAGE === 'local') {
    const fallback =
      env.NODE_ENV === 'test' ? path.join(os.tmpdir(), 'chat-test-media') : DEV_MEDIA_DIR;
    return createLocalStorage({ dir: env.LOCAL_MEDIA_DIR ?? fallback });
  }
  return null;
}
