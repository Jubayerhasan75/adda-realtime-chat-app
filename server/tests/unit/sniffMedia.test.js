import { describe, expect, it } from 'vitest';
import { formatKind, sniffMedia } from '../../src/utils/sniffMedia.js';

const bytes = (...parts) =>
  Buffer.concat(
    parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p))),
  );
const ftyp = (brand) => bytes([0, 0, 0, 0x18], 'ftyp', brand, Buffer.alloc(16));

describe('sniffMedia', () => {
  it('detects photos by their content and reads their size', () => {
    const png = bytes(
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      [0, 0, 0, 13],
      'IHDR',
      [0, 0, 1, 0],
      [0, 0, 0, 200],
    );
    expect(sniffMedia(png)).toEqual({ format: 'png', width: 256, height: 200 });

    const gif = bytes('GIF89a', [64, 1, 32, 0], Buffer.alloc(8));
    expect(sniffMedia(gif)).toEqual({ format: 'gif', width: 320, height: 32 });

    // JPEG: start marker, an APP0 segment, then a baseline frame header (SOF0) with 480×640.
    const jpeg = bytes(
      [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00],
      [0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x80, 0x01, 0xe0],
      Buffer.alloc(8),
    );
    expect(sniffMedia(jpeg)).toEqual({ format: 'jpg', width: 480, height: 640 });

    const webp = bytes(
      'RIFF',
      [0, 0, 0, 0],
      'WEBP',
      'VP8X',
      Buffer.alloc(8),
      [99, 0, 0],
      [49, 0, 0],
    );
    expect(sniffMedia(webp)).toEqual({ format: 'webp', width: 100, height: 50 });
  });

  it('detects iPhone HEIC photos and common video containers', () => {
    expect(sniffMedia(ftyp('heic')).format).toBe('heic');
    expect(sniffMedia(ftyp('mif1')).format).toBe('heif');
    expect(sniffMedia(ftyp('qt  ')).format).toBe('mov');
    expect(sniffMedia(ftyp('isom')).format).toBe('mp4');
    expect(sniffMedia(bytes([0x1a, 0x45, 0xdf, 0xa3], Buffer.alloc(12))).format).toBe('webm');
  });

  it('rejects anything else, whatever its name claims', () => {
    expect(sniffMedia(Buffer.from('#!/bin/sh\necho hi\n'))).toBeNull();
    expect(sniffMedia(Buffer.from('%PDF-1.7\n%âãÏÓ\n'))).toBeNull();
    expect(sniffMedia(bytes('MZ', Buffer.alloc(30)))).toBeNull(); // Windows program
    expect(sniffMedia(ftyp('avif'))).toBeNull();
    expect(sniffMedia(Buffer.alloc(4))).toBeNull();
  });

  it('maps formats to photo or video', () => {
    expect(formatKind('jpg')).toBe('image');
    expect(formatKind('mov')).toBe('video');
    expect(formatKind('unknown')).toBeNull();
  });
});
