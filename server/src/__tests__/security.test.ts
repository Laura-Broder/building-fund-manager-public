import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { localAccess } from '../security';

const app = express();
app.use(localAccess);
app.all('/api/test', (_req, res) => res.json({ ok: true }));

describe('local browser access boundary', () => {
  it.each(['http://localhost:5173', 'http://127.0.0.1:3001'])('allows the local UI %s', async origin => {
    const res = await request(app).post('/api/test').set('Host', 'localhost:3001').set('Origin', origin);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });
  it.each(['http://evil.example', 'null', 'http://localhost:5173.evil.example'])('rejects untrusted origin %s', async origin => {
    expect((await request(app).post('/api/test').set('Host', 'localhost:3001').set('Origin', origin)).status).toBe(403);
  });
  it('rejects DNS rebinding hosts even with a trusted Origin', async () => {
    expect((await request(app).get('/api/test').set('Host', 'evil.example:3001').set('Origin', 'http://localhost:5173')).status).toBe(403);
  });
  it('blocks cross-site navigation and no-cors reads without an Origin', async () => {
    expect((await request(app).get('/api/test').set('Host', 'localhost:3001').set('Sec-Fetch-Site', 'cross-site')).status).toBe(403);
  });
  it('allows direct local CLI use without browser headers', async () => {
    expect((await request(app).get('/api/test').set('Host', '127.0.0.1:3001')).status).toBe(200);
  });
});
