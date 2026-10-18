import { describe, expect, it } from 'vitest';
import { deliveryStatus } from './deliveryStatus.js';

describe('deliveryStatus', () => {
  const peer = { deliveredUpToSeq: 5, readUpToSeq: 3 };

  it('is seen up to the read watermark, delivered up to the delivered one, then sent', () => {
    expect(deliveryStatus({ seq: 2 }, peer)).toBe('seen');
    expect(deliveryStatus({ seq: 3 }, peer)).toBe('seen');
    expect(deliveryStatus({ seq: 4 }, peer)).toBe('delivered');
    expect(deliveryStatus({ seq: 6 }, peer)).toBe('sent');
  });

  it('never shows "seen" when read receipts are hidden', () => {
    expect(deliveryStatus({ seq: 1 }, { deliveredUpToSeq: 5 })).toBe('delivered');
  });

  it('falls back to "sent" before the conversation state has loaded', () => {
    expect(deliveryStatus({ seq: 1 }, undefined)).toBe('sent');
  });
});
