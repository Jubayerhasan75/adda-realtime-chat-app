import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from '../helpers/testApp.js';

describe('API error handling', () => {
  const app = createTestApp();

  it('returns the standard JSON error shape for unknown API routes', async () => {
    const res = await request(app).get('/api/does-not-exist').expect(404);

    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Resource not found', requestId: expect.any(String) },
    });
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('rejects malformed JSON without leaking parser details', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);

    expect(res.body.error).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(JSON.stringify(res.body)).not.toMatch(/SyntaxError|stack/);
  });

  it('rejects bodies larger than 32 KB', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ value: 'x'.repeat(40 * 1024) }))
      .expect(413);

    expect(res.body.error).toMatchObject({ code: 'TOO_LARGE' });
  });
});

describe('security headers', () => {
  it('sends a strict CSP and hides the framework', async () => {
    const res = await request(createTestApp()).get('/api/health').expect(200);

    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('same-origin');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('enables HSTS and request upgrades when served over https', async () => {
    const app = createTestApp({ APP_ORIGIN: 'https://chat.example.com' });
    const res = await request(app).get('/api/health').expect(200);

    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['content-security-policy']).toContain('upgrade-insecure-requests');
  });
});

describe('client hosting', () => {
  let distDir;
  let app;

  beforeAll(async () => {
    distDir = await mkdtemp(path.join(tmpdir(), 'chat-dist-'));
    await mkdir(path.join(distDir, 'assets'));
    await writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>app</title>');
    await writeFile(path.join(distDir, 'assets', 'index-abc123.js'), 'console.log(1);');
    app = createTestApp({ CLIENT_DIST_DIR: distDir });
  });

  afterAll(async () => {
    await rm(distDir, { recursive: true, force: true });
  });

  it('serves index.html for client-side routes without caching it', async () => {
    const res = await request(app).get('/chat/123').set('Accept', 'text/html').expect(200);

    expect(res.text).toContain('<title>app</title>');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('serves hashed assets with long-lived immutable caching', async () => {
    const res = await request(app).get('/assets/index-abc123.js').expect(200);

    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('keeps unknown API routes as JSON 404s instead of returning the page', async () => {
    const res = await request(app).get('/api/nope').set('Accept', 'text/html').expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('test-support routes', () => {
  it('do not exist outside NODE_ENV=test', async () => {
    const app = createTestApp({ NODE_ENV: 'development' });
    const res = await request(app).get('/api/test/last-email?to=a@example.com').expect(404);

    expect(res.body.error.message).toBe('Resource not found');
  });
});
