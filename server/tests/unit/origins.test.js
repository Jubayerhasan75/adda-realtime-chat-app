import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { createOriginCheck } from '../../src/config/origins.js';

const check = (NODE_ENV) =>
  createOriginCheck(
    loadEnv({ NODE_ENV, MONGODB_URI: 'mongodb://x/y', APP_ORIGIN: 'http://localhost:5173' }),
  );

describe('allowed origins', () => {
  it('always allows the app origin and nothing foreign', () => {
    for (const env of ['development', 'test']) {
      expect(check(env)('http://localhost:5173')).toBe(true);
      expect(check(env)('https://evil.example')).toBe(false);
      expect(check(env)(null)).toBe(false);
    }
  });

  it('in development only, allows the dev server opened from a phone on the home Wi-Fi', () => {
    const dev = check('development');
    expect(dev('http://192.168.0.105:5173')).toBe(true);
    expect(dev('http://10.0.0.7:5173')).toBe(true);
    expect(dev('http://172.20.1.2:5173')).toBe(true);

    expect(dev('http://192.168.0.105:4000')).toBe(false); // other port
    expect(dev('https://192.168.0.105:5173')).toBe(false); // other scheme
    expect(dev('http://8.8.8.8:5173')).toBe(false); // public address
    expect(dev('http://172.32.0.1:5173')).toBe(false); // outside the private range
    expect(dev('http://192.168.0.105.evil.example:5173')).toBe(false);
    expect(check('test')('http://192.168.0.105:5173')).toBe(false);
  });
});
