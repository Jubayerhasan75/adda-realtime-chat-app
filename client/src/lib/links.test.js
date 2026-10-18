import { describe, expect, it } from 'vitest';
import { findLinks, linkHost, safeHref, splitLinks } from './links.js';

describe('links in messages', () => {
  it('finds http(s) and www. links and trims trailing punctuation', () => {
    expect(findLinks('Notes: https://example.com/a?b=1, and www.bracu.ac.bd. Thanks!')).toEqual([
      { text: 'https://example.com/a?b=1', href: 'https://example.com/a?b=1' },
      { text: 'www.bracu.ac.bd', href: 'https://www.bracu.ac.bd/' },
    ]);
    expect(findLinks('(see https://youtu.be/xyz)')[0].href).toBe('https://youtu.be/xyz');
  });

  it('never turns other schemes into links', () => {
    expect(findLinks('javascript:alert(1) data:text/html,hi file:///etc/passwd')).toEqual([]);
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('https://localhost')).toBeNull(); // not a public web address
  });

  it('keeps the text around links in order', () => {
    expect(splitLinks('go to https://a.com now')).toEqual([
      { text: 'go to ' },
      { text: 'https://a.com', href: 'https://a.com/' },
      { text: ' now' },
    ]);
    expect(linkHost('https://www.youtube.com/watch?v=1')).toBe('youtube.com');
  });
});
