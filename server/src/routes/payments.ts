import { csvCell } from '../csv-export';
import { Router } from 'express';
import db from '../db';
import { wrapHandler } from '../middleware';

const router = Router();

router.get('/', wrapHandler((req, res) => {
  const { month, year, apartment_id, status } = req.query;
  let sql = `
    SELECT p.*, a.number as apartment_number, a.owner_name
    FROM payments p
    JOIN apartments a ON p.apartment_id = a.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (month) {
    sql += ' AND p.for_month = ?';
    params.push(Number(month));
  }
  if (year) {
    sql += ' AND p.for_year = ?';
    params.push(Number(year));
  }
  if (apartment_id) {
    sql += ' AND p.apartment_id = ?';
    params.push(Number(apartment_id));
  }
  if (status) {
    sql += ' AND p.status = ?';
    params.push(status);
  }

  sql += ' ORDER BY p.paid_date DESC';
  const payments = db.prepare(sql).all(...params);
  res.json(payments);
}));

router.get('/export', wrapHandler((req, res) => {
  const { month, year, apartment_id, status } = req.query;
  let sql = `
    SELECT p.*, a.number as apartment_number, a.owner_name
    FROM payments p
    JOIN apartments a ON p.apartment_id = a.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (month) { sql += ' AND p.for_month = ?'; params.push(Number(month)); }
  if (year) { sql += ' AND p.for_year = ?'; params.push(Number(year)); }
  if (apartment_id) { sql += ' AND p.apartment_id = ?'; params.push(Number(apartment_id)); }
  if (status) { sql += ' AND p.status = ?'; params.push(status); }
  sql += ' ORDER BY p.paid_date DESC';

  const rows = db.prepare(sql).all(...params) as any[];

  const header = 'דירה,שם,סכום,תאריך תשלום,חודש,שנה,הערות,מקור,סטטוס';
  const csvRows = rows.map(r =>
    [r.apartment_number, r.owner_name, r.amount, r.paid_date, r.for_month, r.for_year, r.notes, r.source, r.status].map(csvCell).join(',')
  );
  const csv = '\uFEFF' + [header, ...csvRows].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="payments.csv"');
  res.send(csv);
}));

router.post('/', wrapHandler((req, res) => {
  const { apartment_id, amount, paid_date, months, notes, source } = req.body;
  if (!apartment_id || !amount || !paid_date || !months || !months.length) {
    return res.status(400).json({ error: 'שדות חובה חסרים' });
  }

  const insert = db.prepare(
    "INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year, notes, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
  );

  const amountPerMonth = Math.round((amount / months.length) * 100) / 100;
  const insertMany = db.transaction((months: { month: number; year: number }[]) => {
    const ids: number[] = [];
    for (const m of months) {
      const result = insert.run(
        apartment_id, amountPerMonth, paid_date, m.month, m.year, notes || '', source || 'manual'
      );
      ids.push(Number(result.lastInsertRowid));
    }
    return ids;
  });

  const ids = insertMany(months);
  const payments = db.prepare(
    `SELECT p.*, a.number as apartment_number, a.owner_name
     FROM payments p JOIN apartments a ON p.apartment_id = a.id
     WHERE p.id IN (${ids.map(() => '?').join(',')})`
  ).all(...ids);
  res.status(201).json(payments);
}));

router.post('/bulk-delete', wrapHandler((req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'יש לבחור לפחות פריט אחד' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const deleteMany = db.transaction((ids: number[]) => {
    const result = db.prepare(`DELETE FROM payments WHERE id IN (${placeholders})`).run(...ids);
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
    const result = db.prepare(`UPDATE payments SET status = 'confirmed' WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  });
  const approved = approveMany(ids);
  res.json({ success: true, approved });
}));

router.put('/:id', wrapHandler((req, res) => {
  const { id } = req.params;
  const { apartment_id, amount, paid_date, for_month, for_year, notes } = req.body;

  const existing = db.prepare('SELECT id FROM payments WHERE id = ?').get(Number(id));
  if (!existing) return res.status(404).json({ error: 'תשלום לא נמצא' });

  if (!apartment_id || !amount || !paid_date || !for_month || !for_year) {
    return res.status(400).json({ error: 'שדות חובה חסרים' });
  }

  db.prepare(
    'UPDATE payments SET apartment_id = ?, amount = ?, paid_date = ?, for_month = ?, for_year = ?, notes = ? WHERE id = ?'
  ).run(Number(apartment_id), Number(amount), paid_date, Number(for_month), Number(for_year), notes || '', Number(id));

  const updated = db.prepare(
    `SELECT p.*, a.number as apartment_number, a.owner_name
     FROM payments p JOIN apartments a ON p.apartment_id = a.id
     WHERE p.id = ?`
  ).get(Number(id));
  res.json(updated);
}));

router.patch('/:id/approve', wrapHandler((req, res) => {
  const payment = db.prepare(
    `SELECT p.*, a.number as apartment_number, a.owner_name
     FROM payments p JOIN apartments a ON p.apartment_id = a.id
     WHERE p.id = ?`
  ).get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'תשלום לא נמצא' });
  db.prepare("UPDATE payments SET status = 'confirmed' WHERE id = ?").run(req.params.id);
  const updated = db.prepare(
    `SELECT p.*, a.number as apartment_number, a.owner_name
     FROM payments p JOIN apartments a ON p.apartment_id = a.id
     WHERE p.id = ?`
  ).get(req.params.id);
  res.json(updated);
}));

router.delete('/:id', wrapHandler((req, res) => {
  const payment = db.prepare('SELECT id FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'תשלום לא נמצא' });
  db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
}));

export default router;
