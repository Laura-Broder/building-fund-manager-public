import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { csvUpload, MAX_UPLOAD_BYTES } from '../upload-limits';
import { errorHandler } from '../middleware';

const app = express();
app.post('/upload', csvUpload, (req, res) => res.json({ size: req.file?.size }));
app.use(errorHandler);
afterEach(() => vi.restoreAllMocks());

describe('CSV upload boundary', () => {
  it('accepts a CSV within the size limit', async () => {
    const res = await request(app).post('/upload').attach('file', Buffer.from('date,amount\n2026-01-01,300'), 'statement.csv');
    expect(res.status).toBe(200);
    expect(res.body.size).toBeGreaterThan(0);
  });
  it('rejects oversized files with a useful 413 instead of storing them', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).post('/upload').attach('file', Buffer.alloc(MAX_UPLOAD_BYTES + 1, 'a'), 'large.csv');
    expect(res.status).toBe(413);
    expect(res.body.error).toContain('5');
  });
  it('rejects other file extensions', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await request(app).post('/upload').attach('file', Buffer.from('hello'), 'file.html')).status).toBe(400);
  });
  it('rejects extra multipart fields', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await request(app).post('/upload').field('extra', 'value').attach('file', Buffer.from('a,b'), 'file.csv')).status).toBe(400);
  });
});
