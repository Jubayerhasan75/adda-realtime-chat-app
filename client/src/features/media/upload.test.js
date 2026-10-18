import { describe, expect, it } from 'vitest';
import { checkFile, mimeTypeOf } from './upload.js';

const file = (name, type, size = 1000) =>
  Object.defineProperty(new File(['x'], name, { type }), 'size', { value: size });

describe('checking picked files', () => {
  it('accepts photos and videos, including iPhone HEIC files without a type', () => {
    expect(checkFile(file('a.jpg', 'image/jpeg'))).toEqual({
      kind: 'image',
      mimeType: 'image/jpeg',
    });
    expect(checkFile(file('IMG_0001.HEIC', ''))).toEqual({ kind: 'image', mimeType: 'image/heic' });
    expect(checkFile(file('clip.mov', ''))).toEqual({ kind: 'video', mimeType: 'video/quicktime' });
    expect(mimeTypeOf(file('x.webm', 'video/webm'))).toBe('video/webm');
  });

  it('rejects other files, empty files and files over the size limits', () => {
    expect(checkFile(file('notes.pdf', 'application/pdf')).error).toMatch(/only photos and videos/);
    expect(checkFile(file('empty.png', 'image/png', 0)).error).toMatch(/empty/);
    expect(checkFile(file('big.jpg', 'image/jpeg', 11 * 1024 * 1024)).error).toMatch(/up to 10 MB/);
    expect(checkFile(file('long.mp4', 'video/mp4', 101 * 1024 * 1024)).error).toMatch(
      /up to 100 MB/,
    );
    expect(checkFile(file('clip.mp4', 'video/mp4'), { imagesOnly: true }).error).toMatch(
      /isn’t a photo/,
    );
  });
});
