import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import db from '../db';
import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS } from '../defaults';
import { wrapHandler } from '../middleware';

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');

const router = Router();

router.get('/', wrapHandler((_req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all() as any[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  res.json(settings);
}));

router.put('/', wrapHandler((req, res) => {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  const entries = Object.entries(req.body) as [string, string][];
  const feeEntry = entries.find(([key]) => key === 'monthly_fee');

  const updateMany = db.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) {
      upsert.run(key, value);
    }

    // Sync latest fee history entry when monthly_fee changes
    if (feeEntry) {
      const newFee = Number(feeEntry[1]);
      const latest = db.prepare(
        'SELECT * FROM monthly_fee_history ORDER BY effective_from_year DESC, effective_from_month DESC LIMIT 1'
      ).get() as any;

      if (latest) {
        db.prepare('UPDATE monthly_fee_history SET amount = ? WHERE id = ?').run(newFee, latest.id);
      } else {
        const now = new Date();
        db.prepare(
          'INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)'
        ).run(newFee, now.getMonth() + 1, now.getFullYear());
      }
    }
  });
  updateMany(entries);

  const rows = db.prepare('SELECT * FROM settings').all() as any[];
  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  res.json(settings);
}));

// Fee history CRUD
router.get('/fee-history', wrapHandler((_req, res) => {
  const rows = db.prepare(
    'SELECT * FROM monthly_fee_history ORDER BY effective_from_year ASC, effective_from_month ASC'
  ).all();
  res.json(rows);
}));

router.post('/fee-history', wrapHandler((req, res) => {
  const { amount, effective_from_month, effective_from_year } = req.body;
  if (amount == null || !effective_from_month || !effective_from_year) {
    return res.status(400).json({ error: 'יש למלא סכום, חודש ושנה' });
  }
  if (effective_from_month < 1 || effective_from_month > 12) {
    return res.status(400).json({ error: 'חודש חייב להיות בין 1 ל-12' });
  }

  const existing = db.prepare(
    'SELECT id FROM monthly_fee_history WHERE effective_from_month = ? AND effective_from_year = ?'
  ).get(effective_from_month, effective_from_year) as any;

  if (existing) {
    db.prepare('UPDATE monthly_fee_history SET amount = ? WHERE id = ?').run(Number(amount), existing.id);
  } else {
    db.prepare(
      'INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (?, ?, ?)'
    ).run(Number(amount), effective_from_month, effective_from_year);
  }

  // Update the monthly_fee setting to match the latest entry
  const latest = db.prepare(
    'SELECT amount FROM monthly_fee_history ORDER BY effective_from_year DESC, effective_from_month DESC LIMIT 1'
  ).get() as any;
  if (latest) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(String(latest.amount));
  }

  const rows = db.prepare(
    'SELECT * FROM monthly_fee_history ORDER BY effective_from_year ASC, effective_from_month ASC'
  ).all();
  res.json(rows);
}));

router.delete('/fee-history/:id', wrapHandler((req, res) => {
  const { id } = req.params;
  const entry = db.prepare('SELECT id FROM monthly_fee_history WHERE id = ?').get(Number(id));
  if (!entry) {
    return res.status(404).json({ error: 'רשומת דמי ועד לא נמצאה' });
  }

  db.prepare('DELETE FROM monthly_fee_history WHERE id = ?').run(Number(id));

  // Update monthly_fee setting to match the (new) latest entry
  const latest = db.prepare(
    'SELECT amount FROM monthly_fee_history ORDER BY effective_from_year DESC, effective_from_month DESC LIMIT 1'
  ).get() as any;
  if (latest) {
    db.prepare("INSERT INTO settings (key, value) VALUES ('monthly_fee', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(String(latest.amount));
  }

  const rows = db.prepare(
    'SELECT * FROM monthly_fee_history ORDER BY effective_from_year ASC, effective_from_month ASC'
  ).all();
  res.json(rows);
}));

// Category Keywords CRUD
router.get('/category-keywords', wrapHandler((_req, res) => {
  const rows = db.prepare('SELECT * FROM expense_category_keywords ORDER BY category, keyword').all();
  res.json(rows);
}));

router.post('/category-keywords', wrapHandler((req, res) => {
  const { keyword, category } = req.body;
  if (!keyword?.trim() || !category?.trim()) {
    return res.status(400).json({ error: 'יש למלא מילת מפתח וקטגוריה' });
  }
  try {
    const result = db.prepare(
      'INSERT INTO expense_category_keywords (keyword, category) VALUES (?, ?)'
    ).run(keyword.trim(), category.trim());
    const row = db.prepare('SELECT * FROM expense_category_keywords WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'מילת מפתח זו כבר קיימת' });
    }
    throw e;
  }
}));

router.delete('/category-keywords/:id', wrapHandler((req, res) => {
  const entry = db.prepare('SELECT id FROM expense_category_keywords WHERE id = ?').get(Number(req.params.id));
  if (!entry) return res.status(404).json({ error: 'מילת מפתח לא נמצאה' });
  db.prepare('DELETE FROM expense_category_keywords WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
}));

// Recurring Expenses CRUD
router.get('/recurring-expenses', wrapHandler((_req, res) => {
  const rows = db.prepare('SELECT * FROM recurring_expenses ORDER BY id').all();
  res.json(rows);
}));

router.post('/recurring-expenses', wrapHandler((req, res) => {
  const { description, category, expected_amount, vendor, frequency } = req.body;
  if (!description?.trim() || !category?.trim() || !expected_amount) {
    return res.status(400).json({ error: 'יש למלא תיאור, קטגוריה וסכום צפוי' });
  }
  const result = db.prepare(
    'INSERT INTO recurring_expenses (description, category, expected_amount, vendor, frequency) VALUES (?, ?, ?, ?, ?)'
  ).run(description.trim(), category.trim(), Number(expected_amount), vendor || '', frequency || 'monthly');
  const row = db.prepare('SELECT * FROM recurring_expenses WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
}));

router.delete('/recurring-expenses/:id', wrapHandler((req, res) => {
  const entry = db.prepare('SELECT id FROM recurring_expenses WHERE id = ?').get(Number(req.params.id));
  if (!entry) return res.status(404).json({ error: 'הוצאה חוזרת לא נמצאה' });
  db.prepare('DELETE FROM recurring_expenses WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
}));

// Ordered array for FK-safe deletion (children before parents).
// Adding a new entity = adding one entry at the correct position.
const RESET_ENTRIES: { key: string; reset: () => void }[] = [
  { key: 'payments', reset: () => db.exec('DELETE FROM payments') },
  { key: 'name_aliases', reset: () => db.exec('DELETE FROM name_aliases') },
  { key: 'apartments', reset: () => db.exec('DELETE FROM apartments') },
  { key: 'expenses', reset: () => db.exec('DELETE FROM expenses') },
  { key: 'expense_category_aliases', reset: () => db.exec('DELETE FROM expense_category_aliases') },
  {
    key: 'expense_categories',
    reset: () => {
      db.exec('DELETE FROM expense_category_aliases');
      db.exec('DELETE FROM expense_categories');
      const insert = db.prepare('INSERT INTO expense_categories (name) VALUES (?)');
      for (const cat of DEFAULT_CATEGORIES) insert.run(cat);
    },
  },
  { key: 'fee_history', reset: () => db.exec('DELETE FROM monthly_fee_history') },
  { key: 'ownership_history', reset: () => db.exec('DELETE FROM ownership_history') },
  { key: 'category_keywords', reset: () => db.exec('DELETE FROM expense_category_keywords') },
  { key: 'recurring_expenses', reset: () => db.exec('DELETE FROM recurring_expenses') },
  { key: 'special_payments', reset: () => db.exec('DELETE FROM special_payments') },
  { key: 'special_funds', reset: () => { db.exec('DELETE FROM special_payments'); db.exec('DELETE FROM special_funds'); } },
  { key: 'uploaded_files', reset: () => db.exec('DELETE FROM uploaded_files') },
  {
    key: 'settings',
    reset: () => {
      db.exec('DELETE FROM settings');
      const insert = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insert.run(key, value);
    },
  },
];

const VALID_ENTITIES = new Set(RESET_ENTRIES.map(e => e.key));

router.post('/reset', wrapHandler((req, res) => {
  const { entities } = req.body;
  if (!Array.isArray(entities) || entities.length === 0) {
    res.status(400).json({ error: 'יש לבחור לפחות סוג נתון אחד לאיפוס' });
    return;
  }

  const invalid = entities.filter((e: string) => !VALID_ENTITIES.has(e));
  if (invalid.length > 0) {
    res.status(400).json({ error: `סוגי נתונים לא חוקיים: ${invalid.join(', ')}` });
    return;
  }

  const selected = new Set<string>(entities);

  let filesToDelete: string[] = [];
  if (selected.has('uploaded_files')) {
    const rows = db.prepare('SELECT filename FROM uploaded_files').all() as any[];
    filesToDelete = rows.map((r: any) => r.filename);
  }

  const reset = db.transaction(() => {
    for (const entry of RESET_ENTRIES) {
      if (selected.has(entry.key)) entry.reset();
    }
  });

  reset();

  for (const filename of filesToDelete) {
    const filePath = path.resolve(UPLOADS_DIR, filename);
    if (!filePath.startsWith(path.resolve(UPLOADS_DIR))) continue;
    try { fs.unlinkSync(filePath); } catch { /* file may already be gone */ }
  }

  res.json({ success: true });
}));

export default router;
