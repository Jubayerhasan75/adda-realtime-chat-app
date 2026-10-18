import { describe, expect, it } from 'vitest';
import { safeRedirect } from './safeRedirect.js';

describe('safeRedirect', () => {
  it.each(['/chats', '/chats/abc?x=1', '/settings'])('allows the in-app path %s', (path) => {
    expect(safeRedirect(path)).toBe(path);
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '',
    null,
  ])('falls back for unsafe value %s', (value) => {
    expect(safeRedirect(value)).toBe('/chats');
  });
});
