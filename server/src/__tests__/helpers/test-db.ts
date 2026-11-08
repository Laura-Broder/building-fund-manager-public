import Database from 'better-sqlite3';

export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

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
      source TEXT DEFAULT 'manual',
      reference TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      status TEXT DEFAULT 'confirmed'
    );

    CREATE TABLE IF NOT EXISTS expenses (
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

    CREATE TABLE IF NOT EXISTS ownership_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      owner_name TEXT NOT NULL,
      from_month INTEGER NOT NULL CHECK(from_month BETWEEN 1 AND 12),
      from_year INTEGER NOT NULL,
      to_month INTEGER CHECK(to_month IS NULL OR (to_month BETWEEN 1 AND 12)),
      to_year INTEGER
    );

    CREATE TABLE IF NOT EXISTS monthly_fee_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      effective_from_month INTEGER NOT NULL CHECK(effective_from_month BETWEEN 1 AND 12),
      effective_from_year INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX idx_apartments_number ON apartments(number);
  `);

  return db;
}

export function seedTestData(db: Database.Database) {
  db.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)').run('1', 'יוסי כהן');
  db.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)').run('2', 'רחל לוי');
  db.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)').run('3', 'אברהם ישראלי');
}
