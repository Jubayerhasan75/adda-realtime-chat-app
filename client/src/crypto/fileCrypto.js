import { randomBytes, utf8 } from './encoding.js';

// docs/E2EE.md §4: each file has its own AES-256-GCM key and is encrypted in 1 MiB chunks.
// Every chunk's IV is derived from a random base IV and its index, and the associated data
// binds the index and whether it is the last chunk, so reordering or truncation is detected.
export const FILE_CHUNK_BYTES = 1024 * 1024;
const TAG_BYTES = 16;

export const newFileKeyBytes = () => randomBytes(32);
export const newFileIv = () => randomBytes(12);

export function importFileKey(bytes) {
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function chunkIv(baseIv, index) {
  const iv = new Uint8Array(baseIv);
  const view = new DataView(iv.buffer);
  view.setUint32(8, view.getUint32(8) ^ index);
  return iv;
}

const chunkAad = (index, last) => utf8(`adda/v1/file|${index}|${last ? 1 : 0}`);

/** Encrypted size of a file of `size` bytes. */
export const encryptedSize = (size) => size + Math.ceil(size / FILE_CHUNK_BYTES) * TAG_BYTES;

/**
 * @param {Uint8Array} bytes
 * @param {{ key: CryptoKey, iv: Uint8Array, onProgress?: (fraction: number) => void }} options
 */
export async function encryptFile(bytes, { key, iv, onProgress }) {
  if (bytes.length === 0) throw new Error('Empty file');
  const count = Math.ceil(bytes.length / FILE_CHUNK_BYTES);
  const out = new Uint8Array(encryptedSize(bytes.length));
  for (let index = 0; index < count; index += 1) {
    const plain = bytes.subarray(index * FILE_CHUNK_BYTES, (index + 1) * FILE_CHUNK_BYTES);
    const sealed = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: chunkIv(iv, index),
        additionalData: chunkAad(index, index === count - 1),
      },
      key,
      plain,
    );
    out.set(new Uint8Array(sealed), index * (FILE_CHUNK_BYTES + TAG_BYTES));
    onProgress?.((index + 1) / count);
  }
  return out;
}

/**
 * @param {Uint8Array} sealed
 * @param {{ key: CryptoKey, iv: Uint8Array }} options
 * @returns {Promise<Uint8Array>} throws if anything was changed, reordered or cut off
 */
export async function decryptFile(sealed, { key, iv }) {
  const stride = FILE_CHUNK_BYTES + TAG_BYTES;
  const count = Math.ceil(sealed.length / stride);
  if (count === 0) throw new Error('Empty file');
  const parts = [];
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    const plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: chunkIv(iv, index),
        additionalData: chunkAad(index, index === count - 1),
      },
      key,
      sealed.subarray(index * stride, (index + 1) * stride),
    );
    parts.push(new Uint8Array(plain));
    total += plain.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
