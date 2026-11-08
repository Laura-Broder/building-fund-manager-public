import { csvCell } from '../csv-export';
import { Router } from 'express';
import db from '../db';
import { wrapHandler } from '../middleware';

const router = Router();

router.get('/', wrapHandler((req, res) => {
  const { category, from, to, status } = req.query;
  let sql = 'SELECT * FROM expenses WHERE 1=1';
  const params: any[] = [];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (from) {
    sql += ' AND date >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND date <= ?';
    params.push(to);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY date DESC';
  const expenses = db.prepare(sql).all(...params);
  res.json(expenses);
}));

router.get('/export', wrapHandler((req, res) => {
  const { category, from, to, status } = req.query;
  let sql = 'SELECT * FROM expenses WHERE 1=1';
  const params: any[] = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (from) { sql += ' AND date >= ?'; params.push(from); }
  if (to) { sql += ' AND date <= ?'; params.push(to); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY date DESC';

  const rows = db.prepare(sql).all(...params) as any[];

  const header = 'תאריך,קטגוריה,תיאור,ספק,סכום,מקור,סטטוס';
  const csvRows = rows.map(r =>
    [r.date, r.category, r.description, r.vendor, r.amount, r.source, r.status].map(csvCell).join(',')
  );
  const csv = '\uFEFF' + [header, ...csvRows].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
  res.send(csv);
}));

router.post('/', wrapHandler((req, res) => {
  const { amount, category, description, date, vendor, source } = req.body;
  if (!amount || !category || !date) {
    return res.status(400).json({ error: 'שדות חובה חסרים' });
  }
  const result = db.prepare(
    "INSERT INTO expenses (amount, category, description, date, vendor, source, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
  ).run(amount, category, description || '', date, vendor || '', source || 'manual');
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(expense);
}));

router.post('/bulk-delete', wrapHandler((req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'יש לבחור לפחות פריט אחד' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const deleteMany = db.transaction((ids: number[]) => {
    const result = db.prepare(`DELETE FROM expenses WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  });
  const deleted = deleteMany(ids);
  res.json({ success: true, deleted });
}));

router.post('/bulk-approve', wrapHandler((req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'יש לבחור לפחות פריט אחד' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const approveMany = db.transaction((ids: number[]) => {
    const result = db.prepare(`UPDATE expenses SET status = 'confirmed' WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  });
  const approved = approveMany(ids);
  res.json({ success: true, approved });
}));

// --- Expense Categories (must be before /:id to avoid route conflicts) ---

router.get('/categories', wrapHandler((_req, res) => {
  const categories = db.prepare('SELECT * FROM expense_categories ORDER BY id').all();
  res.json(categories);
}));

router.post('/categories', wrapHandler((req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'שם קטגוריה חסר' });
  }
  try {
    const result = db.prepare('INSERT INTO expense_categories (name) VALUES (?)').run(name.trim());
    const category = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(category);
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'קטגוריה זו כבר קיימת' });
    }
    throw e;
  }
}));

router.delete('/categories/:id', wrapHandler((req, res) => {
  const category = db.prepare('SELECT id FROM expense_categories WHERE id = ?').get(req.params.id);
  if (!category) return res.status(404).json({ error: 'קטגוריה לא נמצאה' });
  db.prepare('DELETE FROM expense_categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
}));

router.put('/:id', wrapHandler((req, res) => {
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!expense) return res.status(404).json({ error: 'הוצאה לא נמצאה' });

  const { amount, category, description, date, vendor } = req.body;
  if (!amount || !category || !date) {
    return res.status(400).json({ error: 'שדות חובה חסרים' });
  }

  db.prepare(
    'UPDATE expenses SET amount = ?, category = ?, description = ?, date = ?, vendor = ? WHERE id = ?'
  ).run(Number(amount), category, description || '', date, vendor || '', req.params.id);
  const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  res.json(updated);
}));

router.patch('/:id', wrapHandler((req, res) => {
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!expense) return res.status(404).json({ error: 'הוצאה לא נמצאה' });
  const { category } = req.body;
  if (!category) return res.status(400).json({ error: 'קטגוריה חסרה' });
  db.prepare('UPDATE expenses SET category = ? WHERE id = ?').run(category, req.params.id);
  const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  res.json(updated);
}));

router.patch('/:id/approve', wrapHandler((req, res) => {
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  if (!expense) return res.status(404).json({ error: 'הוצאה לא נמצאה' });
  db.prepare("UPDATE expenses SET status = 'confirmed' WHERE id = ?").run(req.params.id);
  const updated = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  res.json(updated);
}));

router.delete('/:id', wrapHandler((req, res) => {
  const expense = db.prepare('SELECT id FROM expenses WHERE id = ?').get(req.params.id);
  if (!expense) return res.status(404).json({ error: 'הוצאה לא נמצאה' });
  db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
  res.json({ success: true });
}));

export default router;
