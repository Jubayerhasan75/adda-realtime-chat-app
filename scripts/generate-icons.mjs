// Renders the app icons from client/public/icons/icon.svg with the installed Edge browser
// (no image library needed). Run: node scripts/generate-icons.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dir = new URL('../client/public/icons/', import.meta.url);
const svg = readFileSync(new URL('icon.svg', dir), 'utf8');
// Full-bleed square with the bubble inside the central "safe zone", for maskable icons and
// iOS (both apply their own rounding).
const fullBleed = svg
  .replace('rx="112" ', '')
  .replace(/<path/, '<g transform="translate(51.2 51.2) scale(0.8)"><path')
  .replace('</svg>', '</g></svg>');

// Android's status-bar badge: a white silhouette on transparent (the system tints it).
const badge = svg.replace(/<rect[^>]*\/>/, '').replace(/<circle[^>]*\/>/g, '');

const outputs = [
  ['badge-96.png', 96, badge, true],
  ['icon-192.png', 192, svg, true],
  ['icon-512.png', 512, svg, true],
  ['maskable-512.png', 512, fullBleed, false],
  ['apple-touch-icon.png', 180, fullBleed, false],
  ['favicon-32.png', 32, svg, true],
];

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
for (const [name, size, source, transparent] of outputs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: fileURLToPath(new URL(name, dir)), omitBackground: transparent });
  process.stdout.write(`wrote ${name}\n`);
}
await browser.close();
