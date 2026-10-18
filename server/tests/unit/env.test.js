import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env.js';

const VALID_URI = 'mongodb+srv://user:secret-password@cluster.example.net/chat_dev';

describe('loadEnv', () => {
  it('applies safe defaults when only the database URI is given', () => {
    const env = loadEnv({ MONGODB_URI: VALID_URI });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      APP_ORIGIN: 'http://localhost:5173',
      LOG_LEVEL: 'info',
      TRUST_PROXY_HOPS: 0,
    });
    expect(Object.isFrozen(env)).toBe(true);
  });

  it('coerces numeric values and normalizes the origin', () => {
    const env = loadEnv({
      MONGODB_URI: VALID_URI,
      PORT: '8080',
      TRUST_PROXY_HOPS: '1',
      APP_ORIGIN: 'http://localhost:5173/',
    });

    expect(env.PORT).toBe(8080);
    expect(env.TRUST_PROXY_HOPS).toBe(1);
    expect(env.APP_ORIGIN).toBe('http://localhost:5173');
  });

  it('rejects a missing database URI', () => {
    expect(() => loadEnv({})).toThrow(/MONGODB_URI/);
  });

  it('rejects a non-MongoDB URI', () => {
    expect(() => loadEnv({ MONGODB_URI: 'postgres://localhost/db' })).toThrow(/MONGODB_URI/);
  });

  it('requires an https origin in production', () => {
    expect(() =>
      loadEnv({
        MONGODB_URI: VALID_URI,
        NODE_ENV: 'production',
        APP_ORIGIN: 'http://app.example.com',
      }),
    ).toThrow(/https/);
  });

  it('never includes secret values in its error message', () => {
    let error;
    try {
      loadEnv({ MONGODB_URI: VALID_URI, PORT: 'not-a-port' });
    } catch (err) {
      error = err;
    }

    expect(error.message).toMatch(/PORT/);
    expect(error.message).not.toContain('secret-password');
  });
});
