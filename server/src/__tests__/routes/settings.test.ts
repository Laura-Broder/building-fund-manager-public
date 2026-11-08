import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';

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
    CREATE TABLE name_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      alias TEXT NOT NULL UNIQUE
    );
    CREATE TABLE expense_category_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alias TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL
    );
    CREATE TABLE expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE uploaded_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      size INTEGER NOT NULL,
      upload_date TEXT NOT NULL DEFAULT (datetime('now')),
      payments_imported INTEGER NOT NULL DEFAULT 0,
      expenses_imported INTEGER NOT NULL DEFAULT 0
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
    CREATE TABLE expense_category_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL
    );
    CREATE TABLE recurring_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      expected_amount REAL NOT NULL,
      vendor TEXT DEFAULT '',
      frequency TEXT NOT NULL DEFAULT 'monthly'
    );
  `);
  return db;
});

vi.mock('../../db', () => ({ default: testDb }));

import { createTestApp } from '../helpers/test-app';
import settingsRouter from '../../routes/settings';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../../defaults';
const app = createTestApp(settingsRouter, '/api/settings');

function seedData() {
  testDb.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)').run('1', 'יוסי');
  const aptId = (testDb.prepare('SELECT id FROM apartments WHERE number = ?').get('1') as any).id;
  testDb.prepare('INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year) VALUES (?, ?, ?, ?, ?)').run(aptId, 300, '2024-01-15', 1, 2024);
  testDb.prepare('INSERT INTO expenses (amount, category, date) VALUES (?, ?, ?)').run(500, 'ניקיון', '2024-01-10');
  testDb.prepare('INSERT INTO name_aliases (apartment_id, alias) VALUES (?, ?)').run(aptId, 'יוסי כהן');
  testDb.prepare('INSERT INTO expense_category_aliases (alias, category) VALUES (?, ?)').run('חב חשמל', 'חשמל ומים');
  testDb.prepare('INSERT INTO expense_categories (name) VALUES (?)').run('בדיקה');
  testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '500')").run();
  testDb.prepare("INSERT INTO settings (key, value) VALUES ('building_name', 'בניין בדיקה')").run();
  testDb.prepare("INSERT INTO uploaded_files (filename, original_name, size) VALUES (?, ?, ?)").run('abc.csv', 'bank.csv', 1024);
}

beforeEach(() => {
  testDb.prepare('DELETE FROM name_aliases').run();
  testDb.prepare('DELETE FROM payments').run();
  testDb.prepare('DELETE FROM apartments').run();
  testDb.prepare('DELETE FROM expenses').run();
  testDb.prepare('DELETE FROM expense_category_aliases').run();
  testDb.prepare('DELETE FROM expense_categories').run();
  testDb.prepare('DELETE FROM uploaded_files').run();
  testDb.prepare('DELETE FROM monthly_fee_history').run();
  testDb.prepare('DELETE FROM expense_category_keywords').run();
  testDb.prepare('DELETE FROM recurring_expenses').run();
  testDb.prepare('DELETE FROM settings').run();
});

describe('GET /api/settings', () => {
  it('returns settings as key-value object', async () => {
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '300')").run();
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.monthly_fee).toBe('300');
  });
});

describe('PUT /api/settings', () => {
  it('upserts settings and returns full object', async () => {
    const res = await request(app).put('/api/settings').send({ monthly_fee: '400', building_name: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.monthly_fee).toBe('400');
    expect(res.body.building_name).toBe('test');
  });
});

describe('POST /api/settings/reset', () => {
  it('returns 400 for empty entities array', async () => {
    const res = await request(app).post('/api/settings/reset').send({ entities: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 for missing entities', async () => {
    const res = await request(app).post('/api/settings/reset').send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid entity names', async () => {
    const res = await request(app).post('/api/settings/reset').send({ entities: ['bogus'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('bogus');
  });

  it('deletes only payments when selected', async () => {
    seedData();
    const res = await request(app).post('/api/settings/reset').send({ entities: ['payments'] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(testDb.prepare('SELECT COUNT(*) as c FROM payments').get()).toEqual({ c: 0 });
    expect((testDb.prepare('SELECT COUNT(*) as c FROM apartments').get() as any).c).toBe(1);
  });

  it('deletes only expenses when selected', async () => {
    seedData();
    await request(app).post('/api/settings/reset').send({ entities: ['expenses'] });
    expect((testDb.prepare('SELECT COUNT(*) as c FROM expenses').get() as any).c).toBe(0);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM apartments').get() as any).c).toBe(1);
  });

  it('deletes apartments and cascades to payments and name_aliases', async () => {
    seedData();
    await request(app).post('/api/settings/reset').send({ entities: ['apartments'] });

    expect((testDb.prepare('SELECT COUNT(*) as c FROM apartments').get() as any).c).toBe(0);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM payments').get() as any).c).toBe(0);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM name_aliases').get() as any).c).toBe(0);
  });

  it('deletes name_aliases without touching apartments', async () => {
    seedData();
    await request(app).post('/api/settings/reset').send({ entities: ['name_aliases'] });
    expect((testDb.prepare('SELECT COUNT(*) as c FROM name_aliases').get() as any).c).toBe(0);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM apartments').get() as any).c).toBe(1);
  });

  it('deletes expense_category_aliases', async () => {
    seedData();
    await request(app).post('/api/settings/reset').send({ entities: ['expense_category_aliases'] });
    expect((testDb.prepare('SELECT COUNT(*) as c FROM expense_category_aliases').get() as any).c).toBe(0);
  });

  it('resets expense_categories to defaults and clears category aliases', async () => {
    seedData();
    await request(app).post('/api/settings/reset').send({ entities: ['expense_categories'] });

    const cats = testDb.prepare('SELECT name FROM expense_categories ORDER BY id').all() as any[];
    const names = cats.map((c: any) => c.name);
    expect(names).toEqual(DEFAULT_CATEGORIES);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM expense_category_aliases').get() as any).c).toBe(0);
  });

  it('resets settings to defaults', async () => {
    seedData();
    await request(app).post('/api/settings/reset').send({ entities: ['settings'] });

    const rows = testDb.prepare('SELECT * FROM settings').all() as any[];
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;
    expect(settings.monthly_fee).toBe(DEFAULT_SETTINGS.monthly_fee);
    expect(settings.building_name).toBe(DEFAULT_SETTINGS.building_name);
  });

  it('deletes uploaded_files records', async () => {
    seedData();
    await request(app).post('/api/settings/reset').send({ entities: ['uploaded_files'] });
    expect((testDb.prepare('SELECT COUNT(*) as c FROM uploaded_files').get() as any).c).toBe(0);
  });

  it('resets multiple entities at once', async () => {
    seedData();
    await request(app).post('/api/settings/reset').send({
      entities: ['payments', 'expenses', 'expense_category_aliases'],
    });

    expect((testDb.prepare('SELECT COUNT(*) as c FROM payments').get() as any).c).toBe(0);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM expenses').get() as any).c).toBe(0);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM expense_category_aliases').get() as any).c).toBe(0);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM apartments').get() as any).c).toBe(1);
  });

  it('resets everything when all entities selected', async () => {
    seedData();
    await request(app).post('/api/settings/reset').send({
      entities: [
        'apartments', 'payments', 'expenses', 'name_aliases',
        'expense_category_aliases', 'expense_categories', 'uploaded_files', 'settings',
      ],
    });

    expect((testDb.prepare('SELECT COUNT(*) as c FROM apartments').get() as any).c).toBe(0);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM payments').get() as any).c).toBe(0);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM expenses').get() as any).c).toBe(0);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM name_aliases').get() as any).c).toBe(0);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM expense_category_aliases').get() as any).c).toBe(0);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM uploaded_files').get() as any).c).toBe(0);

    // Defaults re-seeded
    const cats = testDb.prepare('SELECT name FROM expense_categories ORDER BY id').all() as any[];
    expect(cats.length).toBe(DEFAULT_CATEGORIES.length);
    const settings = testDb.prepare('SELECT * FROM settings').all() as any[];
    expect(settings.length).toBe(Object.keys(DEFAULT_SETTINGS).length);
  });

  describe('file deletion', () => {
    let unlinkSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    });

    afterEach(() => {
      unlinkSpy.mockRestore();
    });

    it('deletes physical files from disk when resetting uploaded_files', async () => {
      seedData();
      await request(app).post('/api/settings/reset').send({ entities: ['uploaded_files'] });
      expect(unlinkSpy).toHaveBeenCalledWith(expect.stringContaining('abc.csv'));
    });

    it('skips files with path traversal in filename', async () => {
      testDb.prepare("INSERT INTO uploaded_files (filename, original_name, size) VALUES (?, ?, ?)").run('../../etc/passwd', 'hack.csv', 100);
      await request(app).post('/api/settings/reset').send({ entities: ['uploaded_files'] });
      expect(unlinkSpy).not.toHaveBeenCalled();
    });
  });

  it('auto-clears expense_category_aliases when resetting only expense_categories', async () => {
    seedData();
    await request(app).post('/api/settings/reset').send({ entities: ['expense_categories'] });

    expect((testDb.prepare('SELECT COUNT(*) as c FROM expense_category_aliases').get() as any).c).toBe(0);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM apartments').get() as any).c).toBe(1);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM name_aliases').get() as any).c).toBe(1);
  });

  it('resets fee_history', async () => {
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(300, 1, 2024);
    const res = await request(app).post('/api/settings/reset').send({ entities: ['fee_history'] });
    expect(res.status).toBe(200);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM monthly_fee_history').get() as any).c).toBe(0);
  });
});

describe('GET /api/settings/fee-history', () => {
  it('returns empty array when no entries', async () => {
    const res = await request(app).get('/api/settings/fee-history');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns entries sorted by date', async () => {
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(400, 6, 2024);
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(300, 1, 2023);
    const res = await request(app).get('/api/settings/fee-history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].amount).toBe(300);
    expect(res.body[1].amount).toBe(400);
  });
});

describe('POST /api/settings/fee-history', () => {
  it('creates a new fee history entry', async () => {
    const res = await request(app).post('/api/settings/fee-history').send({
      amount: 350, effective_from_month: 3, effective_from_year: 2025,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].amount).toBe(350);
  });

  it('updates existing entry for same month/year', async () => {
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(300, 1, 2024);
    const res = await request(app).post('/api/settings/fee-history').send({
      amount: 400, effective_from_month: 1, effective_from_year: 2024,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].amount).toBe(400);
  });

  it('syncs monthly_fee setting to latest entry', async () => {
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '300')").run();
    await request(app).post('/api/settings/fee-history').send({
      amount: 500, effective_from_month: 6, effective_from_year: 2025,
    });
    const setting = testDb.prepare("SELECT value FROM settings WHERE key = 'monthly_fee'").get() as any;
    expect(setting.value).toBe('500');
  });

  it('returns 400 for missing fields', async () => {
    const res = await request(app).post('/api/settings/fee-history').send({ amount: 300 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid month', async () => {
    const res = await request(app).post('/api/settings/fee-history').send({
      amount: 300, effective_from_month: 13, effective_from_year: 2024,
    });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/settings/fee-history/:id', () => {
  it('deletes an entry', async () => {
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(300, 1, 2024);
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(400, 6, 2024);
    const rows = testDb.prepare('SELECT id FROM monthly_fee_history ORDER BY id').all() as any[];

    const res = await request(app).delete(`/api/settings/fee-history/${rows[0].id}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].amount).toBe(400);
  });

  it('returns 404 for non-existent id', async () => {
    const res = await request(app).delete('/api/settings/fee-history/999');
    expect(res.status).toBe(404);
  });

  it('syncs monthly_fee setting after deletion', async () => {
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', '400')").run();
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(300, 1, 2024);
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(400, 6, 2024);
    const latest = testDb.prepare('SELECT id FROM monthly_fee_history ORDER BY effective_from_year DESC, effective_from_month DESC LIMIT 1').get() as any;

    await request(app).delete(`/api/settings/fee-history/${latest.id}`);
    const setting = testDb.prepare("SELECT value FROM settings WHERE key = 'monthly_fee'").get() as any;
    expect(setting.value).toBe('300');
  });
});

describe('PUT /api/settings monthly_fee sync', () => {
  it('updates latest fee history entry when monthly_fee changes', async () => {
    testDb.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)').run(300, 1, 2024);
    await request(app).put('/api/settings').send({ monthly_fee: '450' });

    const rows = testDb.prepare('SELECT * FROM monthly_fee_history').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(450);
  });

  it('creates fee history entry if none exists when monthly_fee changes', async () => {
    await request(app).put('/api/settings').send({ monthly_fee: '500' });

    const rows = testDb.prepare('SELECT * FROM monthly_fee_history').all() as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(500);
  });
});

describe('Category Keywords CRUD', () => {
  describe('GET /api/settings/category-keywords', () => {
    it('returns empty array when no keywords', async () => {
      const res = await request(app).get('/api/settings/category-keywords');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all keywords sorted by category', async () => {
      testDb.prepare('INSERT INTO expense_category_keywords (keyword, category) VALUES (?, ?)').run('חשמל', 'חשמל ומים');
      testDb.prepare('INSERT INTO expense_category_keywords (keyword, category) VALUES (?, ?)').run('ניקיון', 'ניקיון');
      const res = await request(app).get('/api/settings/category-keywords');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe('POST /api/settings/category-keywords', () => {
    it('creates a new keyword mapping', async () => {
      const res = await request(app).post('/api/settings/category-keywords').send({
        keyword: 'גז', category: 'תחזוקה',
      });
      expect(res.status).toBe(201);
      expect(res.body.keyword).toBe('גז');
      expect(res.body.category).toBe('תחזוקה');
      expect(res.body.id).toBeDefined();
    });

    it('returns 400 for missing keyword', async () => {
      const res = await request(app).post('/api/settings/category-keywords').send({ category: 'ניקיון' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing category', async () => {
      const res = await request(app).post('/api/settings/category-keywords').send({ keyword: 'גז' });
      expect(res.status).toBe(400);
    });

    it('returns 409 for duplicate keyword', async () => {
      testDb.prepare('INSERT INTO expense_category_keywords (keyword, category) VALUES (?, ?)').run('חשמל', 'חשמל ומים');
      const res = await request(app).post('/api/settings/category-keywords').send({
        keyword: 'חשמל', category: 'תחזוקה',
      });
      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /api/settings/category-keywords/:id', () => {
    it('deletes a keyword mapping', async () => {
      testDb.prepare('INSERT INTO expense_category_keywords (keyword, category) VALUES (?, ?)').run('ביטוח', 'ביטוח');
      const row = testDb.prepare('SELECT id FROM expense_category_keywords WHERE keyword = ?').get('ביטוח') as any;
      const res = await request(app).delete(`/api/settings/category-keywords/${row.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(testDb.prepare('SELECT COUNT(*) as c FROM expense_category_keywords').get()).toEqual({ c: 0 });
    });

    it('returns 404 for non-existent id', async () => {
      const res = await request(app).delete('/api/settings/category-keywords/999');
      expect(res.status).toBe(404);
    });
  });
});

describe('Recurring Expenses CRUD', () => {
  describe('GET /api/settings/recurring-expenses', () => {
    it('returns empty array when no entries', async () => {
      const res = await request(app).get('/api/settings/recurring-expenses');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all recurring expenses', async () => {
      testDb.prepare('INSERT INTO recurring_expenses (description, category, expected_amount) VALUES (?, ?, ?)').run('ניקיון חודשי', 'ניקיון', 800);
      testDb.prepare('INSERT INTO recurring_expenses (description, category, expected_amount) VALUES (?, ?, ?)').run('ביטוח שנתי', 'ביטוח', 5000);
      const res = await request(app).get('/api/settings/recurring-expenses');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe('POST /api/settings/recurring-expenses', () => {
    it('creates a new recurring expense', async () => {
      const res = await request(app).post('/api/settings/recurring-expenses').send({
        description: 'חשמל מדרגות', category: 'חשמל ומים', expected_amount: 450, vendor: 'חב חשמל',
      });
      expect(res.status).toBe(201);
      expect(res.body.description).toBe('חשמל מדרגות');
      expect(res.body.expected_amount).toBe(450);
      expect(res.body.vendor).toBe('חב חשמל');
      expect(res.body.frequency).toBe('monthly');
    });

    it('returns 400 for missing required fields', async () => {
      const res = await request(app).post('/api/settings/recurring-expenses').send({ description: 'test' });
      expect(res.status).toBe(400);
    });

    it('uses default vendor and frequency', async () => {
      const res = await request(app).post('/api/settings/recurring-expenses').send({
        description: 'מעלית', category: 'מעלית', expected_amount: 300,
      });
      expect(res.status).toBe(201);
      expect(res.body.vendor).toBe('');
      expect(res.body.frequency).toBe('monthly');
    });
  });

  describe('DELETE /api/settings/recurring-expenses/:id', () => {
    it('deletes a recurring expense', async () => {
      testDb.prepare('INSERT INTO recurring_expenses (description, category, expected_amount) VALUES (?, ?, ?)').run('ניקיון', 'ניקיון', 800);
      const row = testDb.prepare('SELECT id FROM recurring_expenses').get() as any;
      const res = await request(app).delete(`/api/settings/recurring-expenses/${row.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(testDb.prepare('SELECT COUNT(*) as c FROM recurring_expenses').get()).toEqual({ c: 0 });
    });

    it('returns 404 for non-existent id', async () => {
      const res = await request(app).delete('/api/settings/recurring-expenses/999');
      expect(res.status).toBe(404);
    });
  });
});

describe('POST /api/settings/reset - new entities', () => {
  it('resets category_keywords', async () => {
    testDb.prepare('INSERT INTO expense_category_keywords (keyword, category) VALUES (?, ?)').run('חשמל', 'חשמל ומים');
    const res = await request(app).post('/api/settings/reset').send({ entities: ['category_keywords'] });
    expect(res.status).toBe(200);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM expense_category_keywords').get() as any).c).toBe(0);
  });

  it('resets recurring_expenses', async () => {
    testDb.prepare('INSERT INTO recurring_expenses (description, category, expected_amount) VALUES (?, ?, ?)').run('ניקיון', 'ניקיון', 800);
    const res = await request(app).post('/api/settings/reset').send({ entities: ['recurring_expenses'] });
    expect(res.status).toBe(200);
    expect((testDb.prepare('SELECT COUNT(*) as c FROM recurring_expenses').get() as any).c).toBe(0);
  });
});
