import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from './defaults';

const DB_PATH = path.join(__dirname, '..', 'data', 'building.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true, mode: 0o700 });
fs.chmodSync(path.dirname(DB_PATH), 0o700);
const db = new Database(DB_PATH);
fs.chmodSync(DB_PATH, 0o600);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS apartments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      owner_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      paid_date TEXT NOT NULL,
      for_month INTEGER NOT NULL CHECK(for_month BETWEEN 1 AND 12),
      for_year INTEGER NOT NULL,
      notes TEXT DEFAULT '',
      source TEXT DEFAULT 'manual'
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      date TEXT NOT NULL,
      vendor TEXT DEFAULT '',
      source TEXT DEFAULT 'manual'
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS name_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      alias TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS expense_category_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alias TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS uploaded_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      size INTEGER NOT NULL,
      upload_date TEXT NOT NULL DEFAULT (datetime('now')),
      payments_imported INTEGER NOT NULL DEFAULT 0,
      expenses_imported INTEGER NOT NULL DEFAULT 0
    );

  `);

  const upsertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    upsertSetting.run(key, value);
  }

  const upsertCategory = db.prepare('INSERT OR IGNORE INTO expense_categories (name) VALUES (?)');
  for (const cat of DEFAULT_CATEGORIES) {
    upsertCategory.run(cat);
  }

  // Migration: add reference column for CSV duplicate detection
  const paymentCols = db.pragma('table_info(payments)') as any[];
  if (!paymentCols.some((c: any) => c.name === 'reference')) {
    db.exec(`ALTER TABLE payments ADD COLUMN reference TEXT DEFAULT ''`);
  }
  const expenseCols = db.pragma('table_info(expenses)') as any[];
  if (!expenseCols.some((c: any) => c.name === 'reference')) {
    db.exec(`ALTER TABLE expenses ADD COLUMN reference TEXT DEFAULT ''`);
  }

  // Migration: add created_at column for tracking when data was added
  if (!paymentCols.some((c: any) => c.name === 'created_at')) {
    db.exec(`ALTER TABLE payments ADD COLUMN created_at TEXT DEFAULT ''`);
  }
  const expenseCols2 = db.pragma('table_info(expenses)') as any[];
  if (!expenseCols2.some((c: any) => c.name === 'created_at')) {
    db.exec(`ALTER TABLE expenses ADD COLUMN created_at TEXT DEFAULT ''`);
  }

  // Migration: add status column for pending review feature
  const paymentCols3 = db.pragma('table_info(payments)') as any[];
  if (!paymentCols3.some((c: any) => c.name === 'status')) {
    db.exec(`ALTER TABLE payments ADD COLUMN status TEXT DEFAULT 'confirmed'`);
  }
  const expenseCols3 = db.pragma('table_info(expenses)') as any[];
  if (!expenseCols3.some((c: any) => c.name === 'status')) {
    db.exec(`ALTER TABLE expenses ADD COLUMN status TEXT DEFAULT 'confirmed'`);
  }

  // Migration: add UNIQUE index on apartment number for existing databases
  const existingIndexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='apartments' AND name='idx_apartments_number'").get();
  if (!existingIndexes) {
    db.exec(`CREATE UNIQUE INDEX idx_apartments_number ON apartments(number)`);
  }

  // Migration: add monthly_fee_history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS monthly_fee_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      effective_from_month INTEGER NOT NULL CHECK(effective_from_month BETWEEN 1 AND 12),
      effective_from_year INTEGER NOT NULL
    );
  `);

  // Migration: add ownership_history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ownership_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      owner_name TEXT NOT NULL,
      from_month INTEGER NOT NULL CHECK(from_month BETWEEN 1 AND 12),
      from_year INTEGER NOT NULL,
      to_month INTEGER CHECK(to_month IS NULL OR (to_month BETWEEN 1 AND 12)),
      to_year INTEGER
    );
  `);

  // Migration: add expense_category_keywords table
  db.exec(`
    CREATE TABLE IF NOT EXISTS expense_category_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL
    );
  `);

  // Migration: add recurring_expenses table
  db.exec(`
    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      expected_amount REAL NOT NULL,
      vendor TEXT DEFAULT '',
      frequency TEXT NOT NULL DEFAULT 'monthly'
    );
  `);

  // Migration: add special_funds and special_payments tables
  db.exec(`
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
  `);

  // Migration: drop phone and notes columns from apartments, phone from ownership_history
  const aptCols = db.pragma('table_info(apartments)') as any[];
  if (aptCols.some((c: any) => c.name === 'phone')) {
    db.exec('ALTER TABLE apartments DROP COLUMN phone');
  }
  if (aptCols.some((c: any) => c.name === 'notes')) {
    db.exec('ALTER TABLE apartments DROP COLUMN notes');
  }
  const ohCols = db.pragma('table_info(ownership_history)') as any[];
  if (ohCols.some((c: any) => c.name === 'phone')) {
    db.exec('ALTER TABLE ownership_history DROP COLUMN phone');
  }

  // Seed default category keywords if the table is empty
  const kwCount = (db.prepare('SELECT COUNT(*) as c FROM expense_category_keywords').get() as any).c;
  if (kwCount === 0) {
    const defaultKeywords: [string, string][] = [
      ['חשמל', 'חשמל ומים'],
      ['מים', 'חשמל ומים'],
      ['חשבון', 'חשמל ומים'],
      ['ניקיון', 'ניקיון'],
      ['נקיון', 'ניקיון'],
      ['ביטוח', 'ביטוח'],
      ['מעלית', 'מעלית'],
      ['גינ', 'גינון'],
      ['גנן', 'גינון'],
      ['תיקון', 'תחזוקה'],
      ['אינסטלציה', 'תחזוקה'],
      ['תחזוקה', 'תחזוקה'],
      ['עמלה', 'עמלות בנק'],
      ['עמלת', 'עמלות בנק'],
    ];
    const insertKw = db.prepare('INSERT OR IGNORE INTO expense_category_keywords (keyword, category) VALUES (?, ?)');
    for (const [keyword, category] of defaultKeywords) {
      insertKw.run(keyword, category);
    }
  }

  // Seed fee history from current monthly_fee if the table is empty
  const feeHistoryCount = (db.prepare('SELECT COUNT(*) as c FROM monthly_fee_history').get() as any).c;
  if (feeHistoryCount === 0) {
    const currentFee = db.prepare("SELECT value FROM settings WHERE key = 'monthly_fee'").get() as any;
    if (currentFee) {
      const earliest = db.prepare(
        'SELECT MIN(for_year) as min_year FROM payments'
      ).get() as any;
      const earliestYear = earliest?.min_year || new Date().getFullYear();
      const earliestMonth = earliestYear
        ? (db.prepare('SELECT MIN(for_month) as m FROM payments WHERE for_year = ?').get(earliestYear) as any)?.m || 1
        : 1;
      db.prepare(
        'INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)'
      ).run(Number(currentFee.value), earliestMonth, earliestYear);
    }
  }
}

export default db;
