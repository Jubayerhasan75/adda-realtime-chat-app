// What a file really is, from its first bytes (never its name or claimed type). The server
// can't check end-to-end encrypted files, so the sending and the receiving device do.

const startsWith = (bytes, signature, offset = 0) =>
  signature.every((byte, i) => bytes[offset + i] === byte);
const ascii = (bytes, from, to) => String.fromCharCode(...bytes.subarray(from, to));

/** 'image' | 'video' | null */
export function sniffKind(bytes) {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image';
  if (ascii(bytes, 0, 4) === 'GIF8') return 'image';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image';
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'video';
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (/^(heic|heix|hevc|heim|heis|mif1|msf1|avif)$/.test(brand)) return 'image';
    return 'video';
  }
  return null;
}

/** Throws a readable error unless the bytes really are the expected kind of file. */
export function requireKind(bytes, kind, name = 'This file') {
  if (sniffKind(bytes) !== kind) {
    throw new Error(`“${name}” isn’t a ${kind === 'image' ? 'photo' : 'video'} that can be sent`);
  }
}
