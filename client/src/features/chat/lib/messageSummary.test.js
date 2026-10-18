import { describe, expect, it } from 'vitest';
import { messageSummary } from './messageSummary.js';

const photo = { id: 'a', kind: 'image' };
const video = { id: 'b', kind: 'video' };

describe('messageSummary', () => {
  it('labels media and GIFs, keeping a caption', () => {
    expect(messageSummary({ type: 'text', text: 'hi' })).toBe('hi');
    expect(messageSummary({ type: 'media', text: null, attachments: [photo] })).toBe('📷 Photo');
    expect(messageSummary({ type: 'media', text: 'Trip', attachments: [video] })).toBe(
      '🎥 Video · Trip',
    );
    expect(messageSummary({ type: 'media', attachments: [photo, photo, photo] })).toBe('3 photos');
    expect(messageSummary({ type: 'media', attachments: [photo, video] })).toBe(
      '2 photos and videos',
    );
    expect(messageSummary({ type: 'gif', text: null, gif: {} })).toBe('GIF');
  });

  it('handles reply quotes and unsent messages', () => {
    expect(messageSummary({ text: null, mediaKind: 'image', unsent: false })).toBe('📷 Photo');
    expect(messageSummary({ text: null, mediaKind: 'gif' })).toBe('GIF');
    expect(messageSummary({ text: null, unsent: true })).toBe('Message unsent');
    expect(messageSummary({ unsentAt: '2026-10-17', attachments: [] })).toBe('Message unsent');
  });
});
