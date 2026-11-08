import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const testDb = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      date TEXT NOT NULL,
      vendor TEXT DEFAULT '',
      source TEXT DEFAULT 'manual',
      reference TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      status TEXT DEFAULT 'confirmed'
    );
    CREATE TABLE expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE expense_category_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alias TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL
    );
  `);
  return db;
});

vi.mock('../../db', () => ({ default: testDb }));

import { createTestApp } from '../helpers/test-app';
import expensesRouter from '../../routes/expenses';
const app = createTestApp(expensesRouter, '/api/expenses');

beforeEach(() => {
  testDb.prepare('DELETE FROM expense_category_aliases').run();
  testDb.prepare('DELETE FROM expenses').run();
  testDb.prepare('DELETE FROM expense_categories').run();
  testDb.exec("DELETE FROM sqlite_sequence WHERE name IN ('expenses','expense_categories')");
  testDb.prepare('INSERT INTO expense_categories (name) VALUES (?)').run('ניקיון');
  testDb.prepare('INSERT INTO expense_categories (name) VALUES (?)').run('תחזוקה');
  testDb.prepare('INSERT INTO expense_categories (name) VALUES (?)').run('אחר');
});

describe('GET /api/expenses', () => {
  it('returns empty array when no expenses exist', async () => {
    const res = await request(app).get('/api/expenses');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns expenses ordered by date desc', async () => {
    testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(100, 'ניקיון', '2025-01-15');
    testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(200, 'תחזוקה', '2025-02-15');

    const res = await request(app).get('/api/expenses');
    expect(res.body).toHaveLength(2);
    expect(res.body[0].date).toBe('2025-02-15');
  });

  it('filters by category', async () => {
    testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(100, 'ניקיון', '2025-01-15');
    testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(200, 'תחזוקה', '2025-02-15');

    const res = await request(app).get('/api/expenses?category=ניקיון');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].category).toBe('ניקיון');
  });

  it('filters by date range', async () => {
    testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(100, 'ניקיון', '2025-01-15');
    testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(200, 'תחזוקה', '2025-03-15');

    const res = await request(app).get('/api/expenses?from=2025-02-01&to=2025-04-01');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].amount).toBe(200);
  });

  it('filters by status', async () => {
    testDb.prepare(
      "INSERT INTO expenses (amount, category, date, status) VALUES (?, ?, ?, 'pending_review')"
    ).run(100, 'ניקיון', '2025-01-15');
    testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(200, 'תחזוקה', '2025-02-15');

    const res = await request(app).get('/api/expenses?status=pending_review');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].amount).toBe(100);
  });
});

describe('POST /api/expenses', () => {
  it('creates an expense', async () => {
    const res = await request(app).post('/api/expenses').send({
      amount: 500,
      category: 'ניקיון',
      date: '2025-03-01',
      description: 'ניקוי חודשי',
      vendor: 'חברת ניקיון',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      amount: 500,
      category: 'ניקיון',
      description: 'ניקוי חודשי',
      vendor: 'חברת ניקיון',
      source: 'manual',
    });
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/expenses').send({ amount: 100 });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/expenses/:id', () => {
  it('updates all fields of an expense', async () => {
    const create = testDb.prepare(
      'INSERT INTO expenses (amount, category, date, description, vendor) VALUES (?, ?, ?, ?, ?)'
    ).run(100, 'ניקיון', '2025-01-15', 'תיאור ישן', 'ספק ישן');
    const expId = Number(create.lastInsertRowid);

    const res = await request(app).put(`/api/expenses/${expId}`).send({
      amount: 250,
      category: 'תחזוקה',
      date: '2025-02-20',
      description: 'תיאור חדש',
      vendor: 'ספק חדש',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      amount: 250,
      category: 'תחזוקה',
      date: '2025-02-20',
      description: 'תיאור חדש',
      vendor: 'ספק חדש',
    });
  });

  it('returns 404 for non-existent expense', async () => {
    const res = await request(app).put('/api/expenses/999').send({
      amount: 100,
      category: 'ניקיון',
      date: '2025-01-01',
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when required fields are missing', async () => {
    const create = testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(100, 'ניקיון', '2025-01-15');
    const expId = Number(create.lastInsertRowid);

    const res = await request(app).put(`/api/expenses/${expId}`).send({ amount: 200 });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/expenses/:id (category only)', () => {
  it('updates only the category', async () => {
    const create = testDb.prepare(
      'INSERT INTO expenses (amount, category, date, description) VALUES (?, ?, ?, ?)'
    ).run(100, 'ניקיון', '2025-01-15', 'תיאור');
    const expId = Number(create.lastInsertRowid);

    const res = await request(app).patch(`/api/expenses/${expId}`).send({ category: 'תחזוקה' });
    expect(res.status).toBe(200);
    expect(res.body.category).toBe('תחזוקה');
    expect(res.body.description).toBe('תיאור');
    expect(res.body.amount).toBe(100);
  });

  it('returns 404 for non-existent expense', async () => {
    const res = await request(app).patch('/api/expenses/999').send({ category: 'ניקיון' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/expenses/:id/approve', () => {
  it('approves a pending expense', async () => {
    const create = testDb.prepare(
      "INSERT INTO expenses (amount, category, date, status) VALUES (?, ?, ?, 'pending_review')"
    ).run(100, 'ניקיון', '2025-01-15');
    const expId = Number(create.lastInsertRowid);

    const res = await request(app).patch(`/api/expenses/${expId}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
  });

  it('returns 404 for non-existent expense', async () => {
    const res = await request(app).patch('/api/expenses/999/approve');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/expenses/:id', () => {
  it('deletes an expense', async () => {
    const create = testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(100, 'ניקיון', '2025-01-15');
    const expId = Number(create.lastInsertRowid);

    const res = await request(app).delete(`/api/expenses/${expId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const check = testDb.prepare('SELECT * FROM expenses WHERE id = ?').get(expId);
    expect(check).toBeUndefined();
  });

  it('returns 404 for non-existent expense', async () => {
    const res = await request(app).delete('/api/expenses/999');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/expenses/bulk-delete', () => {
  it('deletes multiple expenses', async () => {
    const id1 = Number(testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(100, 'ניקיון', '2025-01-15').lastInsertRowid);
    const id2 = Number(testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(200, 'תחזוקה', '2025-02-15').lastInsertRowid);

    const res = await request(app).post('/api/expenses/bulk-delete').send({ ids: [id1, id2] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);
  });

  it('returns 400 for empty array', async () => {
    const res = await request(app).post('/api/expenses/bulk-delete').send({ ids: [] });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/expenses/bulk-approve', () => {
  it('approves multiple expenses', async () => {
    const id1 = Number(testDb.prepare(
      "INSERT INTO expenses (amount, category, date, status) VALUES (?, ?, ?, 'pending_review')"
    ).run(100, 'ניקיון', '2025-01-15').lastInsertRowid);
    const id2 = Number(testDb.prepare(
      "INSERT INTO expenses (amount, category, date, status) VALUES (?, ?, ?, 'pending_review')"
    ).run(200, 'תחזוקה', '2025-02-15').lastInsertRowid);

    const res = await request(app).post('/api/expenses/bulk-approve').send({ ids: [id1, id2] });
    expect(res.status).toBe(200);
    expect(res.body.approved).toBe(2);
  });
});

describe('Expense Categories', () => {
  it('GET /api/expenses/categories returns categories', async () => {
    const res = await request(app).get('/api/expenses/categories');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });

  it('POST /api/expenses/categories creates a category', async () => {
    const res = await request(app).post('/api/expenses/categories').send({ name: 'חשמל' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('חשמל');
  });

  it('POST /api/expenses/categories rejects duplicate', async () => {
    const res = await request(app).post('/api/expenses/categories').send({ name: 'ניקיון' });
    expect(res.status).toBe(409);
  });

  it('DELETE /api/expenses/categories/:id deletes a category', async () => {
    const cat = testDb.prepare('SELECT id FROM expense_categories WHERE name = ?').get('אחר') as any;
    const res = await request(app).delete(`/api/expenses/categories/${cat.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/expenses/export', () => {
  it('returns CSV with correct headers', async () => {
    testDb.prepare(
      'INSERT INTO expenses (amount, category, date, description, vendor) VALUES (?, ?, ?, ?, ?)'
    ).run(500, 'ניקיון', '2025-03-01', 'ניקוי חודשי', 'חברת ניקיון');

    const res = await request(app).get('/api/expenses/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('expenses.csv');
    const lines = res.text.replace('\uFEFF', '').split('\n');
    expect(lines[0]).toContain('תאריך');
    expect(lines[0]).toContain('סכום');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('500');
  });

  it('applies filters to export', async () => {
    testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(100, 'ניקיון', '2025-01-15');
    testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(200, 'תחזוקה', '2025-03-15');

    const res = await request(app).get('/api/expenses/export?from=2025-02-01&to=2025-04-01');
    const lines = res.text.replace('\uFEFF', '').split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('200');
  });
});
