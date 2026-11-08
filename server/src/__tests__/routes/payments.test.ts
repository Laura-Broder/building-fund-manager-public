import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const testDb = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE apartments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      owner_name TEXT NOT NULL
    );
    CREATE TABLE payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      paid_date TEXT NOT NULL,
      for_month INTEGER NOT NULL CHECK(for_month BETWEEN 1 AND 12),
      for_year INTEGER NOT NULL,
      notes TEXT DEFAULT '',
      source TEXT DEFAULT 'manual',
      reference TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      status TEXT DEFAULT 'confirmed'
    );
    CREATE TABLE name_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      alias TEXT NOT NULL UNIQUE
    );
    CREATE UNIQUE INDEX idx_apartments_number ON apartments(number);
  `);
  return db;
});

vi.mock('../../db', () => ({ default: testDb }));

import { createTestApp } from '../helpers/test-app';
import paymentsRouter from '../../routes/payments';
const app = createTestApp(paymentsRouter, '/api/payments');

let aptId: number;

beforeEach(() => {
  testDb.prepare('DELETE FROM payments').run();
  testDb.prepare('DELETE FROM apartments').run();
  testDb.exec("DELETE FROM sqlite_sequence WHERE name IN ('apartments','payments')");
  const res = testDb.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)').run('1', 'יוסי כהן');
  aptId = Number(res.lastInsertRowid);
});

describe('GET /api/payments', () => {
  it('returns empty array when no payments exist', async () => {
    const res = await request(app).get('/api/payments');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns payments with apartment info', async () => {
    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(aptId, 100, '2025-01-15', 1, 2025);

    const res = await request(app).get('/api/payments');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      apartment_number: '1',
      owner_name: 'יוסי כהן',
      amount: 100,
    });
  });

  it('filters by month and year', async () => {
    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(aptId, 100, '2025-01-15', 1, 2025);
    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(aptId, 100, '2025-02-15', 2, 2025);

    const res = await request(app).get('/api/payments?month=1&year=2025');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].for_month).toBe(1);
  });

  it('filters by status', async () => {
    testDb.prepare(
      "INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year, status) VALUES (?, ?, ?, ?, ?, 'pending_review')"
    ).run(aptId, 100, '2025-01-15', 1, 2025);
    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(aptId, 200, '2025-02-15', 2, 2025);

    const res = await request(app).get('/api/payments?status=pending_review');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].amount).toBe(100);
  });
});

describe('POST /api/payments', () => {
  it('creates a payment for a single month', async () => {
    const res = await request(app).post('/api/payments').send({
      apartment_id: aptId,
      amount: 150,
      paid_date: '2025-03-01',
      months: [{ month: 3, year: 2025 }],
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      amount: 150,
      for_month: 3,
      for_year: 2025,
      source: 'manual',
    });
  });

  it('splits amount across multiple months', async () => {
    const res = await request(app).post('/api/payments').send({
      apartment_id: aptId,
      amount: 300,
      paid_date: '2025-01-01',
      months: [{ month: 1, year: 2025 }, { month: 2, year: 2025 }, { month: 3, year: 2025 }],
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].amount).toBe(100);
    expect(res.body[1].amount).toBe(100);
    expect(res.body[2].amount).toBe(100);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/payments').send({ apartment_id: aptId });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe('PUT /api/payments/:id', () => {
  it('updates a payment', async () => {
    const create = testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(aptId, 100, '2025-01-15', 1, 2025);
    const paymentId = Number(create.lastInsertRowid);

    const res = await request(app).put(`/api/payments/${paymentId}`).send({
      apartment_id: aptId,
      amount: 200,
      paid_date: '2025-01-20',
      for_month: 2,
      for_year: 2025,
      notes: 'עודכן',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      amount: 200,
      paid_date: '2025-01-20',
      for_month: 2,
      for_year: 2025,
      notes: 'עודכן',
    });
  });

  it('returns 404 for non-existent payment', async () => {
    const res = await request(app).put('/api/payments/999').send({
      apartment_id: aptId,
      amount: 100,
      paid_date: '2025-01-01',
      for_month: 1,
      for_year: 2025,
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when required fields are missing', async () => {
    const create = testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(aptId, 100, '2025-01-15', 1, 2025);
    const paymentId = Number(create.lastInsertRowid);

    const res = await request(app).put(`/api/payments/${paymentId}`).send({
      apartment_id: aptId,
    });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/payments/:id/approve', () => {
  it('approves a pending payment', async () => {
    const create = testDb.prepare(
      "INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year, status) VALUES (?, ?, ?, ?, ?, 'pending_review')"
    ).run(aptId, 100, '2025-01-15', 1, 2025);
    const paymentId = Number(create.lastInsertRowid);

    const res = await request(app).patch(`/api/payments/${paymentId}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
  });

  it('returns 404 for non-existent payment', async () => {
    const res = await request(app).patch('/api/payments/999/approve');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/payments/:id', () => {
  it('deletes a payment', async () => {
    const create = testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(aptId, 100, '2025-01-15', 1, 2025);
    const paymentId = Number(create.lastInsertRowid);

    const res = await request(app).delete(`/api/payments/${paymentId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const check = testDb.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);
    expect(check).toBeUndefined();
  });

  it('returns 404 for non-existent payment', async () => {
    const res = await request(app).delete('/api/payments/999');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/payments/bulk-delete', () => {
  it('deletes multiple payments', async () => {
    const id1 = Number(testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(aptId, 100, '2025-01-15', 1, 2025).lastInsertRowid);
    const id2 = Number(testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(aptId, 200, '2025-02-15', 2, 2025).lastInsertRowid);

    const res = await request(app).post('/api/payments/bulk-delete').send({ ids: [id1, id2] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);
  });

  it('returns 400 for empty array', async () => {
    const res = await request(app).post('/api/payments/bulk-delete').send({ ids: [] });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/payments/bulk-approve', () => {
  it('approves multiple payments', async () => {
    const id1 = Number(testDb.prepare(
      "INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year, status) VALUES (?, ?, ?, ?, ?, 'pending_review')"
    ).run(aptId, 100, '2025-01-15', 1, 2025).lastInsertRowid);
    const id2 = Number(testDb.prepare(
      "INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year, status) VALUES (?, ?, ?, ?, ?, 'pending_review')"
    ).run(aptId, 200, '2025-02-15', 2, 2025).lastInsertRowid);

    const res = await request(app).post('/api/payments/bulk-approve').send({ ids: [id1, id2] });
    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(2);

    const p1 = testDb.prepare('SELECT status FROM payments WHERE id = ?').get(id1) as any;
    expect(p1.status).toBe('confirmed');
  });
});

describe('GET /api/payments/export', () => {
  it('returns CSV with correct headers', async () => {
    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year, notes) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(aptId, 150, '2025-01-15', 1, 2025, 'הערה');

    const res = await request(app).get('/api/payments/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('payments.csv');
    const lines = res.text.replace('\uFEFF', '').split('\n');
    expect(lines[0]).toContain('דירה');
    expect(lines[0]).toContain('סכום');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('150');
  });

  it('applies filters to export', async () => {
    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(aptId, 100, '2025-01-15', 1, 2025);
    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(aptId, 200, '2025-02-15', 2, 2025);

    const res = await request(app).get('/api/payments/export?month=1&year=2025');
    const lines = res.text.replace('\uFEFF', '').split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('100');
  });
});
