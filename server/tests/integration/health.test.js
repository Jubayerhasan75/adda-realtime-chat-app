import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connectDatabase } from '../../src/config/db.js';
import { createTestApp, silentLogger } from '../helpers/testApp.js';
import { startTestDatabase } from '../helpers/testDatabase.js';

describe('health endpoints', () => {
  let database;
  const app = createTestApp();

  beforeAll(async () => {
    database = await startTestDatabase(silentLogger);
  });

  afterAll(async () => {
    await database?.stop();
  });

  it('GET /api/health reports liveness', async () => {
    const res = await request(app).get('/api/health').expect(200);

    expect(res.body).toEqual({ data: { status: 'ok' } });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('GET /api/health/ready reports the database as up', async () => {
    const res = await request(app).get('/api/health/ready').expect(200);

    expect(res.body).toEqual({ data: { status: 'ok', database: 'up' } });
  });

  it('GET /api/health/ready returns 503 while the database is disconnected', async () => {
    await mongoose.disconnect();
    try {
      const res = await request(app).get('/api/health/ready').expect(503);
      expect(res.body.error).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    } finally {
      await connectDatabase(database.uri, silentLogger);
    }
  });
});
