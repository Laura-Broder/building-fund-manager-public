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
    CREATE UNIQUE INDEX idx_apartments_number ON apartments(number);
  `);
  return db;
});

vi.mock('../../db', () => ({ default: testDb }));

import { createTestApp } from '../helpers/test-app';
import analyticsRouter from '../../routes/analytics';
const app = createTestApp(analyticsRouter, '/api/analytics');

beforeEach(() => {
  testDb.prepare('DELETE FROM monthly_fee_history').run();
  testDb.prepare('DELETE FROM settings').run();
  testDb.prepare('DELETE FROM payments').run();
  testDb.prepare('DELETE FROM expenses').run();
  testDb.prepare('DELETE FROM apartments').run();
  testDb.exec("DELETE FROM sqlite_sequence WHERE name IN ('apartments','payments','expenses')");
  testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '150')").run();
  testDb.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)').run('1', 'יוסי');
  testDb.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)').run('2', 'רחל');
});

describe('GET /api/analytics', () => {
  it('returns monthly data with collection rate', async () => {
    const apt = testDb.prepare('SELECT id FROM apartments WHERE number = ?').get('1') as any;
    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(apt.id, 150, '2025-01-15', 1, 2025);

    const res = await request(app).get('/api/analytics?from_year=2025&to_year=2025');
    expect(res.status).toBe(200);
    expect(res.body.monthly).toBeDefined();
    expect(res.body.monthly.length).toBeGreaterThan(0);

    const jan = res.body.monthly.find((m: any) => m.month === 1);
    expect(jan).toBeDefined();
    expect(jan.income).toBe(150);
    expect(jan.collection_rate).toBe(50);
    expect(jan.paid_count).toBe(1);
  });

  it('returns income vs expenses', async () => {
    const apt = testDb.prepare('SELECT id FROM apartments WHERE number = ?').get('1') as any;
    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(apt.id, 300, '2025-01-15', 1, 2025);
    testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(200, 'ניקיון', '2025-01-20');

    const res = await request(app).get('/api/analytics?from_year=2025&to_year=2025&from_month=1&to_month=1');
    const jan = res.body.monthly[0];
    expect(jan.income).toBe(300);
    expect(jan.expenses).toBe(200);
    expect(jan.balance).toBe(100);
  });

  it('returns category breakdown', async () => {
    testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(500, 'ניקיון', '2025-01-20');
    testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(300, 'תחזוקה', '2025-02-15');

    const res = await request(app).get('/api/analytics?from_year=2025&to_year=2025');
    expect(res.body.category_breakdown).toHaveLength(2);
    expect(res.body.category_breakdown[0].category).toBe('ניקיון');
    expect(res.body.category_breakdown[0].total).toBe(500);
  });

  it('calculates running balance', async () => {
    const apt = testDb.prepare('SELECT id FROM apartments WHERE number = ?').get('1') as any;
    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(apt.id, 150, '2025-01-15', 1, 2025);
    testDb.prepare(
      'INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)'
    ).run(apt.id, 150, '2025-02-15', 2, 2025);
    testDb.prepare(
      'INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)'
    ).run(100, 'ניקיון', '2025-01-20');

    const res = await request(app).get('/api/analytics?from_year=2025&to_year=2025&from_month=1&to_month=2');
    expect(res.body.monthly[0].balance).toBe(50);
    expect(res.body.monthly[1].balance).toBe(200);
  });

  it('uses fee history for expected amounts', async () => {
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(200, 1, 2025);

    const res = await request(app).get('/api/analytics?from_year=2025&to_year=2025&from_month=1&to_month=1');
    expect(res.body.monthly[0].expected).toBe(400);
  });
});


describe('collection rate counts fully paid apartments', () => {
  it('excludes partial allocations and combines them against the historical fee', async () => {
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (300, 1, 2025)').run();
    const id = (testDb.prepare("SELECT id FROM apartments WHERE number = '1'").get() as any).id;
    const insert = testDb.prepare('INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)');
    insert.run(id, 150, '2025-01-05', 1, 2025);
    const partial = await request(app).get('/api/analytics?from_year=2025&to_year=2025&from_month=1&to_month=1');
    expect(partial.body.monthly[0].paid_count).toBe(0);
    expect(partial.body.monthly[0].collection_rate).toBe(0);
    expect(partial.body.monthly[0].income).toBe(150);
    insert.run(id, 150, '2025-01-15', 1, 2025);
    const full = await request(app).get('/api/analytics?from_year=2025&to_year=2025&from_month=1&to_month=1');
    expect(full.body.monthly[0].paid_count).toBe(1);
    expect(full.body.monthly[0].collection_rate).toBe(50);
  });
});
