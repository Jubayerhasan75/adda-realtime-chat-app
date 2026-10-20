import { LIMITS } from '@chat/shared';
import { base64UrlToBytes, bytesToBase64Url } from '../../crypto/encoding.js';
import {
  decryptFile,
  encryptFile,
  importFileKey,
  newFileIv,
  newFileKeyBytes,
} from '../../crypto/fileCrypto.js';
import { requireKind } from './sniffFile.js';
import { downloadMedia, measure, mediaUrl, uploadFile } from './upload.js';

// docs/E2EE.md §4. A sent file is described (inside the encrypted message) by:
// { id, kind, mimeType, width, height, durationMs, size, key, iv, parts: [ids],
//   thumb: { iv, parts, width, height } | null }
// The server only ever stores the encrypted parts.

const MAX_SIDE = 2048;
const THUMB_SIDE = 480;
const REENCODE_ABOVE_BYTES = 1.5 * 1024 * 1024;
const BLOB_MIME = 'application/octet-stream';

const isEncrypted = (attachment) => Array.isArray(attachment?.parts);
export { isEncrypted };

function scaled(width, height, max) {
  const ratio = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

async function drawToJpeg(source, width, height, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(source, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not encode the image');
  return new Uint8Array(await blob.arrayBuffer());
}

async function prepareImage(file, mimeType) {
  const original = new Uint8Array(await file.arrayBuffer());
  requireKind(original, 'image', file.name);
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Not decodable here (e.g. HEIC outside Safari): send the original, without a preview.
    return { bytes: original, mimeType, width: null, height: null, thumb: null };
  }
  const { width, height } = bitmap;
  const animated = mimeType === 'image/gif';
  const resize =
    !animated && (Math.max(width, height) > MAX_SIDE || file.size > REENCODE_ABOVE_BYTES);
  const size = resize ? scaled(width, height, MAX_SIDE) : { width, height };
  const bytes = resize ? await drawToJpeg(bitmap, size.width, size.height, 0.85) : original;
  const thumbSize = scaled(width, height, THUMB_SIDE);
  const thumb = await drawToJpeg(bitmap, thumbSize.width, thumbSize.height, 0.7);
  bitmap.close?.();
  return {
    bytes,
    mimeType: resize ? 'image/jpeg' : mimeType,
    ...size,
    thumb: { bytes: thumb, ...thumbSize },
  };
}

function videoFrame(file) {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const done = (value) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 5000);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.onloadeddata = () => {
      video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
    };
    video.onseeked = async () => {
      try {
        const size = scaled(video.videoWidth, video.videoHeight, THUMB_SIDE);
        done({ bytes: await drawToJpeg(video, size.width, size.height, 0.7), ...size });
      } catch {
        done(null);
      }
    };
    video.onerror = () => done(null);
    video.src = url;
  });
}

async function prepareVideo(file, mimeType) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  requireKind(bytes, 'video', file.name);
  const [info, thumb] = await Promise.all([measure(file, 'video'), videoFrame(file)]);
  return {
    bytes,
    mimeType,
    width: info.width ?? null,
    height: info.height ?? null,
    durationMs: info.durationMs ?? null,
    thumb,
  };
}

/** Uploads encrypted bytes as parts small enough for the storage provider. */
async function uploadParts(sealed, { conversationId, signal, onProgress }) {
  const ids = [];
  const count = Math.ceil(sealed.length / LIMITS.BLOB_MAX_BYTES);
  for (let index = 0; index < count; index += 1) {
    const part = sealed.subarray(
      index * LIMITS.BLOB_MAX_BYTES,
      (index + 1) * LIMITS.BLOB_MAX_BYTES,
    );
    const attachment = await uploadFile({
      file: new Blob([part], { type: BLOB_MIME }),
      kind: 'blob',
      mimeType: BLOB_MIME,
      purpose: 'message',
      conversationId,
      signal,
      onProgress: (fraction) => onProgress?.((index + fraction) / count),
    });
    ids.push(attachment.id);
  }
  return ids;
}

/**
 * Prepares (resizes photos, makes a preview), encrypts and uploads one picked file.
 * @returns {Promise<object>} the file description that goes inside the encrypted message
 */
export async function sendEncryptedFile({
  file,
  kind,
  mimeType,
  conversationId,
  signal,
  onProgress,
}) {
  const prepared =
    kind === 'image' ? await prepareImage(file, mimeType) : await prepareVideo(file, mimeType);
  const keyBytes = newFileKeyBytes();
  const key = await importFileKey(keyBytes);
  const iv = newFileIv();
  const sealed = await encryptFile(prepared.bytes, { key, iv });

  let thumb = null;
  if (prepared.thumb) {
    const thumbIv = newFileIv();
    const sealedThumb = await encryptFile(prepared.thumb.bytes, { key, iv: thumbIv });
    thumb = {
      iv: bytesToBase64Url(thumbIv),
      parts: await uploadParts(sealedThumb, { conversationId, signal }),
      width: prepared.thumb.width,
      height: prepared.thumb.height,
    };
  }
  const parts = await uploadParts(sealed, { conversationId, signal, onProgress });
  return {
    id: parts[0],
    kind,
    mimeType: prepared.mimeType,
    width: prepared.width,
    height: prepared.height,
    durationMs: prepared.durationMs ?? null,
    size: prepared.bytes.length,
    key: bytesToBase64Url(keyBytes),
    iv: bytesToBase64Url(iv),
    parts,
    thumb,
  };
}

/** Ids of every stored part of the given files (what the server is told about). */
export const partIdsOf = (attachments) =>
  attachments.flatMap((a) => (isEncrypted(a) ? [...a.parts, ...(a.thumb?.parts ?? [])] : [a.id]));

async function fetchPart(id, signal, onBytes) {
  const response = await fetch(mediaUrl(id, 'full'), { credentials: 'same-origin', signal });
  if (!response.ok) throw new Error('This file isn’t available any more');
  if (!response.body || !onBytes) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    onBytes(value.length);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const cache = new Map(); // `${id}|${variant}` → Promise<object URL>
const MAX_CACHED = 80;

/**
 * An object URL for a decrypted thumbnail or full file, downloaded and decrypted once.
 * @param {object} attachment the decrypted file description
 * @param {'thumb' | 'full'} variant
 */
export function decryptedUrl(attachment, variant, { onProgress } = {}) {
  const source = variant === 'thumb' ? attachment.thumb : attachment;
  if (!source) return Promise.resolve(null);
  const cacheKey = `${attachment.id}|${variant}`;
  if (!cache.has(cacheKey)) {
    const promise = (async () => {
      const total = variant === 'full' ? attachment.size : 0;
      let received = 0;
      const pieces = [];
      for (const id of source.parts) {
        pieces.push(
          await fetchPart(id, undefined, (n) => {
            received += n;
            if (total) onProgress?.(Math.min(0.99, received / total));
          }),
        );
      }
      const sealed = new Uint8Array(pieces.reduce((sum, p) => sum + p.length, 0));
      let offset = 0;
      for (const piece of pieces) {
        sealed.set(piece, offset);
        offset += piece.length;
      }
      const key = await importFileKey(base64UrlToBytes(attachment.key));
      const plain = await decryptFile(sealed, { key, iv: base64UrlToBytes(source.iv) });
      // Shown only if it really is the kind of file the message says.
      requireKind(plain, variant === 'thumb' ? 'image' : attachment.kind);
      const type = variant === 'thumb' ? 'image/jpeg' : attachment.mimeType;
      return URL.createObjectURL(new Blob([plain], { type }));
    })();
    promise.catch(() => cache.delete(cacheKey));
    cache.set(cacheKey, promise);
    while (cache.size > MAX_CACHED) {
      const [oldKey, oldUrl] = cache.entries().next().value;
      cache.delete(oldKey);
      oldUrl.then((url) => url && URL.revokeObjectURL(url)).catch(() => {});
    }
  }
  return cache.get(cacheKey);
}

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

/** Saves a decrypted file to the device. */
export async function saveDecrypted(attachment) {
  const url = await decryptedUrl(attachment, 'full');
  const link = document.createElement('a');
  link.href = url;
  link.download = `adda-${attachment.kind === 'video' ? 'video' : 'photo'}.${EXTENSIONS[attachment.mimeType] ?? 'bin'}`;
  document.body.append(link);
  link.click();
  link.remove();
}

/** Saves sent files (encrypted or older unencrypted ones) to the device. */
export const downloadAttachments = (attachments) => downloadMedia(attachments, saveDecrypted);
