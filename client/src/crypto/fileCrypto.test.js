import { describe, expect, it } from 'vitest';
import {
  FILE_CHUNK_BYTES,
  decryptFile,
  encryptFile,
  encryptedSize,
  importFileKey,
  newFileIv,
  newFileKeyBytes,
} from './fileCrypto.js';

const bytesOf = (length) => Uint8Array.from({ length }, (_, i) => (i * 31) % 251);

describe('file encryption', () => {
  it('round-trips files of one and several chunks', { timeout: 30_000 }, async () => {
    const key = await importFileKey(newFileKeyBytes());
    for (const length of [10, FILE_CHUNK_BYTES, FILE_CHUNK_BYTES * 2 + 5]) {
      const iv = newFileIv();
      const plain = bytesOf(length);
      const sealed = await encryptFile(plain, { key, iv });
      expect(sealed.length).toBe(encryptedSize(length));
      expect(await decryptFile(sealed, { key, iv })).toEqual(plain);
    }
  });

  it(
    'detects a wrong key, a changed byte, reordering and truncation',
    { timeout: 30_000 },
    async () => {
      const key = await importFileKey(newFileKeyBytes());
      const iv = newFileIv();
      const sealed = await encryptFile(bytesOf(FILE_CHUNK_BYTES * 2 + 5), { key, iv });
      const stride = FILE_CHUNK_BYTES + 16;

      const otherKey = await importFileKey(newFileKeyBytes());
      await expect(decryptFile(sealed, { key: otherKey, iv })).rejects.toThrow();

      const changed = sealed.slice();
      changed[100] ^= 1;
      await expect(decryptFile(changed, { key, iv })).rejects.toThrow();

      const swapped = new Uint8Array(sealed.length);
      swapped.set(sealed.subarray(stride, 2 * stride), 0);
      swapped.set(sealed.subarray(0, stride), stride);
      swapped.set(sealed.subarray(2 * stride), 2 * stride);
      await expect(decryptFile(swapped, { key, iv })).rejects.toThrow();

      await expect(decryptFile(sealed.subarray(0, 2 * stride), { key, iv })).rejects.toThrow();
    },
  );
});
