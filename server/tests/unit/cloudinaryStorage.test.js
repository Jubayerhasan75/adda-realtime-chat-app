import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { providerError } from '../../src/providers/storage/cloudinaryStorage.js';

describe('Cloudinary errors', () => {
  it('never carry the API key or secret from the SDK error into logs', () => {
    const sdkError = {
      error: { message: 'cloud_name mismatch', http_code: 401 },
      request_options: { auth: '123456789:super-secret-value', path: '/v1_1/x/resources' },
    };
    const err = providerError('lookup', sdkError);

    expect(err.message).toBe('Cloudinary lookup failed: cloud_name mismatch');
    expect(err.cause).toEqual({ message: 'cloud_name mismatch', http_code: 401 });
    const printed = inspect(err, { depth: 10 }) + JSON.stringify(err.cause);
    expect(printed).not.toContain('super-secret-value');
    expect(printed).not.toContain('123456789');
  });
});
