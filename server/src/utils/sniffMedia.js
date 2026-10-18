/**
 * Identifies a photo/video from its first bytes ("magic numbers"), ignoring the file name and
 * the type the browser claimed, so a renamed text or program file is never accepted as media.
 * Also reads the pixel size of common image formats. Used by the local development storage;
 * Cloudinary performs the same checks itself.
 */

export const FORMAT_MIME_TYPES = Object.freeze({
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
});

/** "image" | "video" for a supported format, otherwise null. */
export function formatKind(format) {
  const mimeType = FORMAT_MIME_TYPES[format];
  if (!mimeType) return null;
  return mimeType.startsWith('video/') ? 'video' : 'image';
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
const MP4_BRANDS = new Set([
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'M4V ',
  'M4A ',
  'dash',
  'mmp4',
  '3gp4',
  '3gp5',
  '3gp6',
  '3g2a',
  'f4v ',
  'MSNV',
  'XAVC',
]);

const ascii = (buffer, start, end) => buffer.toString('latin1', start, end);

function jpegSize(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    // Start-of-frame markers carry the image size (C4, C8 and CC are other segment types).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function webpSize(buffer) {
  const chunk = ascii(buffer, 12, 16);
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  }
  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/**
 * @param {Buffer} buffer the start of the file (the first 64 KB is plenty)
 * @returns {{ format: string, width?: number, height?: number } | null}
 */
export function sniffMedia(buffer) {
  if (buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { format: 'jpg', ...jpegSize(buffer) };
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return buffer.length >= 24
      ? { format: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
      : { format: 'png' };
  }
  if (ascii(buffer, 0, 6) === 'GIF87a' || ascii(buffer, 0, 6) === 'GIF89a') {
    return { format: 'gif', width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') {
    return { format: 'webp', ...webpSize(buffer) };
  }
  if (buffer.readUInt32BE(0) === 0x1a45dfa3) return { format: 'webm' };
  if (ascii(buffer, 4, 8) === 'ftyp') {
    const brand = ascii(buffer, 8, 12);
    if (brand === 'qt  ') return { format: 'mov' };
    if (HEIF_BRANDS.has(brand)) return { format: brand === 'mif1' ? 'heif' : 'heic' };
    if (MP4_BRANDS.has(brand)) return { format: 'mp4' };
  }
  return null;
}
