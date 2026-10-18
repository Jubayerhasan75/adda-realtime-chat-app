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

  it('in a group: delivered once everyone has it, seen once everyone read it', () => {
    const nadia = { deliveredUpToSeq: 5, readUpToSeq: 5 };
    const arif = { deliveredUpToSeq: 5, readUpToSeq: 3 };
    const sadia = { deliveredUpToSeq: 4, readUpToSeq: 4 };
    expect(deliveryStatus({ seq: 3 }, [nadia, arif, sadia])).toBe('seen');
    expect(deliveryStatus({ seq: 4 }, [nadia, arif, sadia])).toBe('delivered');
    expect(deliveryStatus({ seq: 5 }, [nadia, arif, sadia])).toBe('sent');
    // Someone who hides read receipts: never "seen" for the group.
    expect(deliveryStatus({ seq: 1 }, [nadia, { deliveredUpToSeq: 9 }])).toBe('delivered');
  });
});
