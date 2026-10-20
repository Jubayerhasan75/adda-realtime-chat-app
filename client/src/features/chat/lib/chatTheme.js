import { HEX_COLOR } from '@chat/shared';

/** Readable text color (near-black or white) on a #rrggbb background. */
export function textOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return luminance > 0.4 ? '#14111a' : '#ffffff';
}

/**
 * CSS variables for this chat's color. Set on the chat itself: the bubble color is computed
 * there, so changing the accent recolors the bubbles immediately.
 */
export function accentStyle(accent) {
  if (!accent) return undefined;
  if (HEX_COLOR.test(accent)) {
    return { '--chat-accent': accent, '--bubble-out': accent, '--on-bubble-out': textOn(accent) };
  }
  const color = `var(--accent-${accent})`;
  return { '--chat-accent': color, '--bubble-out': color, '--on-bubble-out': '#ffffff' };
}
