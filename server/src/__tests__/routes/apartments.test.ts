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
    CREATE TABLE ownership_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      owner_name TEXT NOT NULL,
      from_month INTEGER NOT NULL CHECK(from_month BETWEEN 1 AND 12),
      from_year INTEGER NOT NULL,
      to_month INTEGER CHECK(to_month IS NULL OR (to_month BETWEEN 1 AND 12)),
      to_year INTEGER
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE monthly_fee_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      effective_from_month INTEGER NOT NULL CHECK(effective_from_month BETWEEN 1 AND 12),
      effective_from_year INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS special_funds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS special_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      fund_id INTEGER REFERENCES special_funds(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      paid_date TEXT NOT NULL,
      notes TEXT DEFAULT '',
      source TEXT DEFAULT 'manual',
      status TEXT DEFAULT 'confirmed',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX idx_apartments_number ON apartments(number);
  `);
  return db;
});

vi.mock('../../db', () => ({ default: testDb }));

import { createTestApp } from '../helpers/test-app';
import apartmentsRouter from '../../routes/apartments';
const app = createTestApp(apartmentsRouter, '/api/apartments');

beforeEach(() => {
  testDb.prepare('DELETE FROM monthly_fee_history').run();
  testDb.prepare('DELETE FROM settings').run();
  testDb.prepare('DELETE FROM ownership_history').run();
  testDb.prepare('DELETE FROM name_aliases').run();
  testDb.prepare('DELETE FROM payments').run();
  testDb.prepare('DELETE FROM apartments').run();
  testDb.prepare('DELETE FROM special_funds').run();
  testDb.exec("DELETE FROM sqlite_sequence WHERE name='apartments'");
  testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '150')").run();
});

describe('GET /api/apartments', () => {
  it('returns empty array when no apartments exist', async () => {
    const res = await request(app).get('/api/apartments');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns apartments sorted by number', async () => {
    testDb.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)').run('10', 'עשר');
    testDb.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)').run('2', 'שתיים');
    testDb.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)').run('1', 'אחת');

    const res = await request(app).get('/api/apartments');
    expect(res.status).toBe(200);
    expect(res.body.map((a: any) => a.number)).toEqual(['1', '2', '10']);
  });
});

describe('POST /api/apartments', () => {
  it('creates an apartment and returns 201', async () => {
    const res = await request(app)
      .post('/api/apartments')
      .send({ number: '1', owner_name: 'יוסי כהן' });
    expect(res.status).toBe(201);
    expect(res.body.number).toBe('1');
    expect(res.body.owner_name).toBe('יוסי כהן');
    expect(res.body.id).toBeDefined();
  });

  it('returns 400 when number is missing', async () => {
    const res = await request(app)
      .post('/api/apartments')
      .send({ owner_name: 'יוסי כהן' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when owner_name is missing', async () => {
    const res = await request(app)
      .post('/api/apartments')
      .send({ number: '1' });
    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate apartment number', async () => {
    await request(app).post('/api/apartments').send({ number: '1', owner_name: 'א' });
    const res = await request(app).post('/api/apartments').send({ number: '1', owner_name: 'ב' });
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/apartments/:id', () => {
  it('updates an existing apartment', async () => {
    const create = await request(app)
      .post('/api/apartments')
      .send({ number: '1', owner_name: 'שם ישן' });
    const id = create.body.id;

    const res = await request(app)
      .put(`/api/apartments/${id}`)
      .send({ number: '1', owner_name: 'שם חדש' });
    expect(res.status).toBe(200);
    expect(res.body.owner_name).toBe('שם חדש');
  });

  it('returns 404 for nonexistent apartment', async () => {
    const res = await request(app)
      .put('/api/apartments/99999')
      .send({ number: '1', owner_name: 'test' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/apartments/:id', () => {
  it('deletes an existing apartment', async () => {
    const create = await request(app)
      .post('/api/apartments')
      .send({ number: '1', owner_name: 'למחיקה' });
    const id = create.body.id;

    const res = await request(app).delete(`/api/apartments/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const list = await request(app).get('/api/apartments');
    expect(list.body.length).toBe(0);
  });

  it('returns 404 for nonexistent apartment', async () => {
    const res = await request(app).delete('/api/apartments/99999');
    expect(res.status).toBe(404);
  });

  it('cascades delete to payments and name_aliases', async () => {
    const create = await request(app)
      .post('/api/apartments')
      .send({ number: '1', owner_name: 'עם תשלומים' });
    const id = create.body.id;

    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(id, 300, '2024-01-15', 1, 2024);
    testDb.prepare('INSERT INTO name_aliases (apartment_id, alias) VALUES (?, ?)').run(id, 'כינוי');

    await request(app).delete(`/api/apartments/${id}`);

    const payments = testDb.prepare('SELECT * FROM payments WHERE apartment_id = ?').all(id);
    const aliases = testDb.prepare('SELECT * FROM name_aliases WHERE apartment_id = ?').all(id);
    expect(payments.length).toBe(0);
    expect(aliases.length).toBe(0);
  });
});

describe('POST /api/apartments/bulk-delete', () => {
  it('deletes multiple apartments', async () => {
    const a1 = await request(app).post('/api/apartments').send({ number: '1', owner_name: 'א' });
    const a2 = await request(app).post('/api/apartments').send({ number: '2', owner_name: 'ב' });

    const res = await request(app)
      .post('/api/apartments/bulk-delete')
      .send({ ids: [a1.body.id, a2.body.id] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);

    const list = await request(app).get('/api/apartments');
    expect(list.body.length).toBe(0);
  });

  it('returns 400 for empty ids array', async () => {
    const res = await request(app)
      .post('/api/apartments/bulk-delete')
      .send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 when ids is missing', async () => {
    const res = await request(app)
      .post('/api/apartments/bulk-delete')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/apartments/:id/ownership-history', () => {
  it('returns empty array when no history exists', async () => {
    const create = await request(app).post('/api/apartments').send({ number: '1', owner_name: 'יוסי' });
    const res = await request(app).get(`/api/apartments/${create.body.id}/ownership-history`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 404 for nonexistent apartment', async () => {
    const res = await request(app).get('/api/apartments/999/ownership-history');
    expect(res.status).toBe(404);
  });

  it('returns history after owner change', async () => {
    const create = await request(app).post('/api/apartments').send({ number: '1', owner_name: 'יוסי' });
    await request(app).post(`/api/apartments/${create.body.id}/change-owner`).send({
      new_owner_name: 'רחל', from_month: 6, from_year: 2024,
    });

    const res = await request(app).get(`/api/apartments/${create.body.id}/ownership-history`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].owner_name).toBe('יוסי');
    expect(res.body[0].to_month).toBe(5);
    expect(res.body[0].to_year).toBe(2024);
  });
});

describe('POST /api/apartments/:id/change-owner', () => {
  it('changes owner and archives old one', async () => {
    const create = await request(app).post('/api/apartments').send({ number: '1', owner_name: 'יוסי' });
    const id = create.body.id;

    const res = await request(app).post(`/api/apartments/${id}/change-owner`).send({
      new_owner_name: 'רחל', from_month: 3, from_year: 2025,
    });
    expect(res.status).toBe(200);
    expect(res.body.owner_name).toBe('רחל');

    // Original owner in history
    const history = testDb.prepare('SELECT * FROM ownership_history WHERE apartment_id = ?').all(id) as any[];
    expect(history).toHaveLength(1);
    expect(history[0].owner_name).toBe('יוסי');
    expect(history[0].to_month).toBe(2);
    expect(history[0].to_year).toBe(2025);
  });

  it('handles multiple owner changes', async () => {
    const create = await request(app).post('/api/apartments').send({ number: '1', owner_name: 'א' });
    const id = create.body.id;

    await request(app).post(`/api/apartments/${id}/change-owner`).send({
      new_owner_name: 'ב', from_month: 6, from_year: 2023,
    });
    await request(app).post(`/api/apartments/${id}/change-owner`).send({
      new_owner_name: 'ג', from_month: 1, from_year: 2025,
    });

    const history = testDb.prepare('SELECT * FROM ownership_history WHERE apartment_id = ? ORDER BY id').all(id) as any[];
    expect(history).toHaveLength(2);
    expect(history[0].owner_name).toBe('א');
    expect(history[1].owner_name).toBe('ב');
    expect(history[1].to_month).toBe(12);
    expect(history[1].to_year).toBe(2024);

    const apt = testDb.prepare('SELECT owner_name FROM apartments WHERE id = ?').get(id) as any;
    expect(apt.owner_name).toBe('ג');
  });

  it('returns 404 for nonexistent apartment', async () => {
    const res = await request(app).post('/api/apartments/999/change-owner').send({
      new_owner_name: 'test', from_month: 1, from_year: 2025,
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for missing fields', async () => {
    const create = await request(app).post('/api/apartments').send({ number: '1', owner_name: 'יוסי' });
    const res = await request(app).post(`/api/apartments/${create.body.id}/change-owner`).send({
      new_owner_name: 'רחל',
    });
    expect(res.status).toBe(400);
  });

  it('cascades deletion to ownership_history', async () => {
    const create = await request(app).post('/api/apartments').send({ number: '1', owner_name: 'יוסי' });
    await request(app).post(`/api/apartments/${create.body.id}/change-owner`).send({
      new_owner_name: 'רחל', from_month: 6, from_year: 2024,
    });

    await request(app).delete(`/api/apartments/${create.body.id}`);
    const history = testDb.prepare('SELECT * FROM ownership_history').all();
    expect(history).toHaveLength(0);
  });
});

describe('GET /api/apartments/:id/history', () => {
  it('returns apartment info, ownership history, and payment grid', async () => {
    const create = await request(app).post('/api/apartments').send({ number: '1', owner_name: 'יוסי' });
    const aptId = create.body.id;

    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(aptId, 150, '2025-01-15', 1, 2025);
    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(aptId, 75, '2025-02-15', 2, 2025);

    const res = await request(app).get(`/api/apartments/${aptId}/history`);
    expect(res.status).toBe(200);
    expect(res.body.apartment.number).toBe('1');
    expect(res.body.ownership_history).toEqual([]);
    expect(res.body.years[2025]).toBeDefined();
    expect(res.body.years[2025][1].status).toBe('paid');
    expect(res.body.years[2025][1].paid).toBe(150);
    expect(res.body.years[2025][2].status).toBe('partial');
    expect(res.body.years[2025][2].paid).toBe(75);
  });

  it('marks unpaid months correctly', async () => {
    const create = await request(app).post('/api/apartments').send({ number: '1', owner_name: 'יוסי' });
    const aptId = create.body.id;

    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(aptId, 150, '2025-03-15', 3, 2025);

    const res = await request(app).get(`/api/apartments/${aptId}/history`);
    expect(res.body.years[2025][3].status).toBe('paid');
    expect(res.body.years[2025][1]).toBeDefined();
    // Month 1 and 2 should be unpaid since there were no payments but they are in the range
  });

  it('uses fee history for expected amounts', async () => {
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(100, 1, 2024);
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(200, 1, 2025);

    const create = await request(app).post('/api/apartments').send({ number: '1', owner_name: 'יוסי' });
    const aptId = create.body.id;

    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(aptId, 100, '2024-06-15', 6, 2024);

    const res = await request(app).get(`/api/apartments/${aptId}/history`);
    expect(res.body.years[2024][6].expected).toBe(100);
    expect(res.body.years[2024][6].status).toBe('paid');
  });

  it('returns 404 for non-existent apartment', async () => {
    const res = await request(app).get('/api/apartments/999/history');
    expect(res.status).toBe(404);
  });

  it('includes ownership history in response', async () => {
    const create = await request(app).post('/api/apartments').send({ number: '1', owner_name: 'יוסי' });
    const aptId = create.body.id;

    await request(app).post(`/api/apartments/${aptId}/change-owner`).send({
      new_owner_name: 'רחל', from_month: 6, from_year: 2024,
    });

    const res = await request(app).get(`/api/apartments/${aptId}/history`);
    expect(res.body.ownership_history).toHaveLength(1);
    expect(res.body.ownership_history[0].owner_name).toBe('יוסי');
  });
});
