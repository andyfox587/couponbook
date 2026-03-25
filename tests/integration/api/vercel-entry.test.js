import { describe, it, expect } from 'vitest';
import request from 'supertest';
import handler from '../../../api/[...slug].js';

describe('Vercel Entrypoint Smoke Test', () => {
  it('GET /api/health should return 200 and ok: true', async () => {
    const response = await request(handler)
      .get('/api/health')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('ok', true);
  });

  it('GET /api/v1/events (public) should return 200', async () => {
    const response = await request(handler)
      .get('/api/v1/events')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
  });

  it('GET /api/non-existent-route should return 404 (handled by Express)', async () => {
    // Note: Our express app doesn't have a 404 handler yet, so it will return default express 404
    await request(handler)
      .get('/api/non-existent-route')
      .expect(404);
  });
});
