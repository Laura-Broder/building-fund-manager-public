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
    CREATE TABLE ownership_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      owner_name TEXT NOT NULL,
      from_month INTEGER NOT NULL CHECK(from_month BETWEEN 1 AND 12),
      from_year INTEGER NOT NULL,
      to_month INTEGER CHECK(to_month IS NULL OR (to_month BETWEEN 1 AND 12)),
      to_year INTEGER
    );
  `);
  return db;
});

vi.mock('../../db', () => ({ default: testDb }));

import { createTestApp } from '../helpers/test-app';
import dashboardRouter from '../../routes/dashboard';
const app = createTestApp(dashboardRouter, '/api/dashboard');

function seedApartments() {
  testDb.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)').run('1', 'יוסי');
  testDb.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)').run('2', 'רחל');
}

function getAptId(num: string): number {
  return (testDb.prepare('SELECT id FROM apartments WHERE number = ?').get(num) as any).id;
}

beforeEach(() => {
  testDb.prepare('DELETE FROM ownership_history').run();
  testDb.prepare('DELETE FROM payments').run();
  testDb.prepare('DELETE FROM expenses').run();
  testDb.prepare('DELETE FROM apartments').run();
  testDb.prepare('DELETE FROM monthly_fee_history').run();
  testDb.prepare('DELETE FROM settings').run();
});

describe('GET /api/dashboard', () => {
  it('returns basic dashboard data', async () => {
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '300')").run();
    seedApartments();
    const res = await request(app).get('/api/dashboard?year=2024&month=1');
    expect(res.status).toBe(200);
    expect(res.body.total_apartments).toBe(2);
    expect(res.body.monthly_fee).toBe(300);
  });

  it('uses fee history for debt calculation', async () => {
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '400')").run();
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(200, 1, 2024);
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(400, 6, 2024);
    seedApartments();
    const aptId = getAptId('1');

    // Apt 1 pays 200 for Jan 2024 (correct for that period)
    testDb.prepare('INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)').run(aptId, 200, '2024-01-15', 1, 2024);
    // Apt 1 pays 400 for June 2024 (correct for that period)
    testDb.prepare('INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)').run(aptId, 400, '2024-06-15', 6, 2024);

    const res = await request(app).get('/api/dashboard?year=2024&month=6');
    expect(res.status).toBe(200);

    // Apt 1 should have no debt for month 1 (paid 200 when fee was 200) and month 6 (paid 400 when fee was 400)
    const apt1Debt = res.body.debts.find((d: any) => d.number === '1');
    // Apt 1 has debt for months 2-5 (fee=200 each) = 800 total
    expect(apt1Debt).toBeDefined();
    expect(apt1Debt.total_debt).toBe(200 * 4); // months 2,3,4,5 at 200 each
  });

  it('uses period-specific fee for total_expected in yearly view', async () => {
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '400')").run();
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(200, 1, 2023);
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(400, 7, 2023);
    seedApartments();

    const res = await request(app).get('/api/dashboard?year=2023');
    expect(res.status).toBe(200);
    // 2 apartments, months 1-6 at 200 = 2400, months 7-12 at 400 = 4800, total = 7200
    expect(res.body.total_expected).toBe(2 * (6 * 200 + 6 * 400));
  });

  it('falls back to settings monthly_fee when no fee history exists', async () => {
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '300')").run();
    seedApartments();

    const res = await request(app).get('/api/dashboard?year=2024&month=1');
    expect(res.status).toBe(200);
    expect(res.body.total_expected).toBe(2 * 300);
  });

  it('segments debts by current vs previous owner', async () => {
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '300')").run();
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(300, 1, 2024);
    seedApartments();
    const aptId = getAptId('1');

    // Previous owner was "אברהם" from Jan-May 2024, current owner "יוסי" from June 2024
    testDb.prepare(
      'INSERT INTO ownership_history (apartment_id, owner_name, from_month, from_year, to_month, to_year) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(aptId, 'אברהם', 1, 2024, 5, 2024);

    // No payments at all for apt 1
    const res = await request(app).get('/api/dashboard?year=2024&month=6');
    expect(res.status).toBe(200);

    // Current owner debts for apt 1 should only include June (month 6)
    const currentDebt = res.body.current_owner_debts.find((d: any) => d.number === '1');
    expect(currentDebt).toBeDefined();
    expect(currentDebt.unpaid_months).toHaveLength(1);
    expect(currentDebt.unpaid_months[0].month).toBe(6);
    expect(currentDebt.total_debt).toBe(300);

    // Previous owner debts for apt 1 should include Jan-May
    const prevDebt = res.body.previous_owner_debts.find((d: any) => d.number === '1' && d.owner_name === 'אברהם');
    expect(prevDebt).toBeDefined();
    expect(prevDebt.unpaid_months).toHaveLength(5);
    expect(prevDebt.total_debt).toBe(5 * 300);
  });

  it('returns current_owner_debts and previous_owner_debts arrays', async () => {
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '300')").run();
    seedApartments();

    const res = await request(app).get('/api/dashboard?year=2024&month=1');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.current_owner_debts)).toBe(true);
    expect(Array.isArray(res.body.previous_owner_debts)).toBe(true);
  });

  it('uses account start date setting for debt calculation', async () => {
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '300')").run();
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('account_start_month', '3')").run();
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('account_start_year', '2024')").run();
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(300, 1, 2024);
    seedApartments();

    const res = await request(app).get('/api/dashboard?year=2024&month=6');
    expect(res.status).toBe(200);

    expect(res.body.debt_start_month).toBe(3);
    expect(res.body.debt_start_year).toBe(2024);

    // Both apartments unpaid from March-June = 4 months each at 300
    const apt1Debt = res.body.current_owner_debts.find((d: any) => d.number === '1');
    expect(apt1Debt).toBeDefined();
    expect(apt1Debt.unpaid_months).toHaveLength(4);
    expect(apt1Debt.unpaid_months[0].month).toBe(3);
    expect(apt1Debt.total_debt).toBe(4 * 300);
  });

  it('falls back to earliest payment when account start date is not set', async () => {
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '300')").run();
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(300, 1, 2024);
    seedApartments();
    const aptId = getAptId('1');

    // Only payment is for Feb 2024 — debt should start from Feb, not Jan
    testDb.prepare('INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)').run(aptId, 300, '2024-02-15', 2, 2024);

    const res = await request(app).get('/api/dashboard?year=2024&month=4');
    expect(res.status).toBe(200);

    expect(res.body.debt_start_month).toBe(2);
    expect(res.body.debt_start_year).toBe(2024);

    // Apt 1: paid Feb, owes Mar+Apr = 600
    const apt1Debt = res.body.current_owner_debts.find((d: any) => d.number === '1');
    expect(apt1Debt).toBeDefined();
    expect(apt1Debt.total_debt).toBe(2 * 300);

    // Apt 2: owes Feb+Mar+Apr = 900
    const apt2Debt = res.body.current_owner_debts.find((d: any) => d.number === '2');
    expect(apt2Debt).toBeDefined();
    expect(apt2Debt.total_debt).toBe(3 * 300);
  });
});


describe('dashboard full-payment status', () => {
  it('keeps a partial month unpaid and combines payments before marking it paid', async () => {
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '300')").run();
    seedApartments();
    const id = getAptId('1');
    const insert = testDb.prepare('INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)');
    insert.run(id, 150, '2024-01-05', 1, 2024);
    const partial = await request(app).get('/api/dashboard?year=2024&month=1');
    expect(partial.body.paid_count).toBe(0);
    expect(partial.body.apartments.find((a: any) => a.id === id).paid).toBe(false);
    insert.run(id, 150, '2024-01-10', 1, 2024);
    const full = await request(app).get('/api/dashboard?year=2024&month=1');
    expect(full.body.paid_count).toBe(1);
    expect(full.body.apartments.find((a: any) => a.id === id).paid).toBe(true);
  });

  it('requires every scoped month to meet its historical fee in yearly status', async () => {
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '400')").run();
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (200, 1, 2024), (400, 7, 2024)').run();
    seedApartments();
    const id = getAptId('1');
    const insert = testDb.prepare('INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)');
    for (let month = 1; month <= 12; month++) insert.run(id, 200, '2024-12-01', month, 2024);
    const partial = await request(app).get('/api/dashboard?year=2024');
    expect(partial.body.paid_count).toBe(0);
    for (let month = 7; month <= 12; month++) insert.run(id, 200, '2024-12-15', month, 2024);
    const full = await request(app).get('/api/dashboard?year=2024');
    expect(full.body.paid_count).toBe(1);
  });
});
