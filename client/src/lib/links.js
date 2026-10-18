/**
 * Finds web links in message text (on the device: messages are end-to-end encrypted). Only
 * http(s) links and "www." addresses count, so things like `javascript:` can never become
 * a link.
 */

// A URL or www. address, up to whitespace; trailing punctuation is trimmed below.
const LINK_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/giu;
const TRAILING = /[.,;:!?)\]}'"»”’]+$/u;

/** Where a found link should go, or null if it isn't a safe web address. */
export function safeHref(raw) {
  try {
    const url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Splits text into plain parts and links, in order.
 * @returns {Array<{ text: string, href?: string }>}
 */
export function splitLinks(text) {
  if (!text) return [];
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const raw = match[0].replace(TRAILING, '');
    const href = safeHref(raw);
    if (!href) continue;
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ text: raw, href });
    last = match.index + raw.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** Just the links in a text, in order (duplicates kept once). */
export function findLinks(text) {
  const seen = new Set();
  return splitLinks(text)
    .filter((part) => part.href && !seen.has(part.href) && seen.add(part.href))
    .map((part) => ({ text: part.text, href: part.href }));
}

/** "youtube.com" from a link, for a compact label. */
export function linkHost(href) {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return href;
  }
}
