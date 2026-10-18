import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from './errors.js';

describe('ERROR_CODES', () => {
  it('maps every key to an identical string value', () => {
    for (const [key, value] of Object.entries(ERROR_CODES)) {
      expect(value).toBe(key);
    }
  });

  it('cannot be modified at runtime', () => {
    expect(Object.isFrozen(ERROR_CODES)).toBe(true);
  });
});
