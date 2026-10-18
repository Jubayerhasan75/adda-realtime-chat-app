// Fails when source files contain invisible bidirectional-control or zero-width characters.
// Such characters can make code display differently from how it runs ("Trojan Source",
// CVE-2021-42574). Write them as escapes instead, e.g. "\u202E".
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
  '.git',
]);
const CHECKED = /\.(js|jsx|cjs|mjs|css|html|json|md)$/;

const isHidden = (codePoint) =>
  // Zero-width space and left-to-right/right-to-left marks. U+200C/U+200D (joiners) are allowed:
  // emoji such as 👩\u200D💻 and scripts such as Bangla legitimately use them.
  codePoint === 0x200b ||
  codePoint === 0x200e ||
  codePoint === 0x200f ||
  (codePoint >= 0x202a && codePoint <= 0x202e) ||
  (codePoint >= 0x2066 && codePoint <= 0x2069);

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* files(fullPath);
    } else if (CHECKED.test(entry.name)) {
      yield fullPath;
    }
  }
}

const problems = [];
for (const file of files('.')) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      for (const char of line) {
        const codePoint = char.codePointAt(0);
        if (isHidden(codePoint)) {
          problems.push(
            `${file}:${index + 1}  U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
          );
        }
      }
    });
}

if (problems.length) {
  console.error(`Hidden characters found (use escapes instead):\n${problems.join('\n')}`);
  process.exit(1);
}
