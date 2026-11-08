import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
vi.mock('../db', () => ({ default: {} }));
import uploadRouter from '../routes/upload';
import { errorHandler } from '../middleware';
import { MAX_PENDING_FILES, UPLOAD_TTL_MS } from '../upload-limits';

const app = express();
app.use(express.json());
app.use('/api/upload', uploadRouter);
app.use(errorHandler);
afterEach(() => vi.useRealTimers());

describe('pending bank statement retention', () => {
  it('caps pending files and rejects expired IDs before touching the database', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    let fileId = '';
    for (let i = 0; i < MAX_PENDING_FILES; i++) {
      const res = await request(app).post('/api/upload/preview').attach('file', Buffer.from('date,amount\n2026-01-01,300'), 'statement.csv');
      expect(res.status).toBe(200);
      fileId = res.body.fileId;
    }
    const full = await request(app).post('/api/upload/preview').attach('file', Buffer.from('a,b\n1,2'), 'statement.csv');
    expect(full.status).toBe(429);
    vi.setSystemTime(Date.now() + UPLOAD_TTL_MS + 1);
    expect((await request(app).post('/api/upload/parse').send({ fileId, mapping: {} })).status).toBe(400);
    expect((await request(app).post('/api/upload/confirm').send({ fileId, rows: [{}] })).status).toBe(400);
    expect((await request(app).post('/api/upload/preview').attach('file', Buffer.from('a,b\n1,2'), 'statement.csv')).status).toBe(200);
  });
  it('rejects binary content masquerading as a CSV', async () => {
    expect((await request(app).post('/api/upload/preview').attach('file', Buffer.from([0, 1, 2]), 'fake.csv')).status).toBe(400);
  });
});
