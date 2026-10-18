// Guards readable contrast (WCAG 2.2 AA) for every foreground/background token pair the UI uses,
// in both themes, by resolving the actual values in tokens.css.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Read from disk: Vitest stubs CSS imports, so `?raw` would yield an empty string.
const css = readFileSync(path.join(import.meta.dirname, 'tokens.css'), 'utf8');

function declarations(selector) {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
}

const light = declarations(':root');
const themes = { light, dark: { ...light, ...declarations(":root[data-theme='dark']") } };

function resolve(vars, value) {
  const match = /^var\((--[\w-]+)(?:,\s*(.+))?\)$/.exec(value);
  if (!match) return value;
  const [, name, fallback] = match;
  if (vars[name]) return resolve(vars, vars[name]);
  return resolve(vars, fallback);
}

function parseColor(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(value);
  if (rgb) return { rgb: rgb.slice(1, 4).map(Number), alpha: rgb[4] ? Number(rgb[4]) : 1 };
  throw new Error(`Unsupported color: ${value}`);
}

function blend(top, bottom) {
  return top.rgb.map((channel, i) => channel * top.alpha + bottom[i] * (1 - top.alpha));
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast of `fg` (optionally with extra opacity) on `bg`, where `bg` may itself be translucent over `base`. */
function contrast(vars, fg, bg, { base = '--surface', opacity = 1 } = {}) {
  const baseColor = parseColor(resolve(vars, `var(${base})`)).rgb;
  const bgColor = blend(parseColor(resolve(vars, `var(${bg})`)), baseColor);
  const fgParsed = parseColor(resolve(vars, `var(${fg})`));
  const fgColor = blend({ ...fgParsed, alpha: fgParsed.alpha * opacity }, bgColor);
  const [hi, lo] = [luminance(fgColor), luminance(bgColor)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS = [
  ['--text', '--surface'],
  ['--text', '--bg'],
  ['--text', '--surface-muted'],
  ['--text', '--surface-active'],
  ['--text', '--primary-soft'],
  ['--text-muted', '--surface'],
  ['--text-muted', '--bg'],
  ['--text-muted', '--surface-muted'],
  ['--text-muted', '--chat-bg'],
  ['--text-muted', '--bubble-in'],
  ['--text-subtle', '--surface'],
  ['--text-subtle', '--surface-muted'],
  ['--link', '--surface'],
  ['--link', '--surface-active'],
  ['--link', '--primary-soft'],
  ['--link', '--chat-bg'],
  ['--on-primary', '--primary'],
  ['--on-bubble-in', '--bubble-in'],
  ['--on-bubble-out', '--bubble-out'],
  ['--danger', '--surface'],
];

const ACCENTS = ['teakhelet', 'ocean', 'forest', 'sunset', 'rose', 'graphite'];

describe.each(ACCENTS)('chat accent %s', (accent) => {
  const vars = { ...light, '--chat-accent': `var(--accent-${accent})` };

  it('keeps message text, timestamps and the seen tick readable on my bubbles', () => {
    expect(contrast(vars, '--on-bubble-out', '--bubble-out')).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(vars, '--on-bubble-out', '--bubble-out', { opacity: 0.75 }),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(vars, '--receipt-seen', '--bubble-out')).toBeGreaterThanOrEqual(3);
  });
});

describe.each(Object.entries(themes))('%s theme contrast', (_name, vars) => {
  it.each(TEXT_PAIRS)('%s on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(vars, fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps bubble timestamps (75% white) readable on my bubbles', () => {
    expect(
      contrast(vars, '--on-bubble-out', '--bubble-out', { opacity: 0.75 }),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps receipt and focus indicators at least 3:1 (non-text contrast)', () => {
    expect(contrast(vars, '--receipt-seen', '--bubble-out')).toBeGreaterThanOrEqual(3);
    expect(contrast(vars, '--focus-ring', '--surface')).toBeGreaterThanOrEqual(3);
    expect(contrast(vars, '--focus-ring', '--bg')).toBeGreaterThanOrEqual(3);
  });
});
