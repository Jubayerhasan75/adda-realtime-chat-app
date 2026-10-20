import { describe, expect, it } from 'vitest';
import { requireKind, sniffKind } from './sniffFile.js';

const bytes = (...values) => Uint8Array.from(values);
const text = (value) => new TextEncoder().encode(value);

describe('sniffKind', () => {
  it('recognises photos and videos by their first bytes', () => {
    expect(sniffKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image');
    expect(sniffKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d))).toBe('image');
    expect(sniffKind(text('GIF89a'))).toBe('image');
    expect(sniffKind(text('RIFF\0\0\0\0WEBPVP8'))).toBe('image');
    expect(sniffKind(text('\0\0\0\x18ftypheic'))).toBe('image');
    expect(sniffKind(text('\0\0\0\x18ftypisom'))).toBe('video');
    expect(sniffKind(text('\0\0\0\x14ftypqt  '))).toBe('video');
    expect(sniffKind(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe('video');
  });

  it('rejects anything else, whatever its name says', () => {
    expect(sniffKind(text('<html><script>'))).toBeNull();
    expect(() => requireKind(text('hello'), 'image', 'holiday.jpg')).toThrow(
      '“holiday.jpg” isn’t a photo that can be sent',
    );
  });
});
