'use strict';

// Minimal env so src/config/app.config.js doesn't throw on required vars and
// src/config/redis.js fails fast instead of retrying a live server.
process.env.TOKEN_SECRET = 'test-secret';
process.env.PAYU_KEY = 'test-key';
process.env.PAYU_SALT = 'test-salt';
process.env.WITHDRAWAL_WEBHOOK_SECRET = 'test-webhook';
process.env.REDIS_URL = 'redis://127.0.0.1:1';
process.env.NODE_ENV = 'test';

// uuid v14 is ESM-only and breaks Jest's CJS transform; mock it so the
// request-id middleware loads in tests.
jest.mock('uuid', () => ({ v4: () => '00000000-0000-4000-8000-000000000000' }));

const request = require('supertest');
const app = require('../../src/app');

describe('GET /', () => {
  it('serves the HTML landing page to browsers', async () => {
    const res = await request(app)
      .get('/')
      .set('Accept', 'text/html,application/xhtml+xml,*/*;q=0.8');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Taddle API');
    expect(res.text).toContain('All systems operational');
  });

  it('returns a JSON status payload to API clients', async () => {
    const res = await request(app).get('/').set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toMatchObject({
      name: 'taddle-box-api',
      status: 'ok',
      version: '1.0.0',
    });
    expect(typeof res.body.uptimeSeconds).toBe('number');
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('does not break existing API routes', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });

  it('keeps the JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Route not found');
  });
});
