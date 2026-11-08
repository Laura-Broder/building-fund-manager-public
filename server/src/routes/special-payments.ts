import { csvCell } from '../csv-export';
import { Router } from 'express';
import db from '../db';
import { wrapHandler } from '../middleware';

const router = Router();

// --- Funds CRUD ---

router.get('/funds', wrapHandler((_req, res) => {
  const funds = db.prepare('SELECT * FROM special_funds ORDER BY name').all();
  res.json(funds);
}));

router.post('/funds', wrapHandler((req, res) => {
  const { name, description } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: 'יש למלא שם קרן' });
  }
  const result = db.prepare(
    'INSERT INTO special_funds (name, description) VALUES (?, ?)'
  ).run(name.trim(), description || '');
  const fund = db.prepare('SELECT * FROM special_funds WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(fund);
}));

router.put('/funds/:id', wrapHandler((req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  const existing = db.prepare('SELECT id FROM special_funds WHERE id = ?').get(Number(id));
  if (!existing) return res.status(404).json({ error: 'קרן לא נמצאה' });
  if (!name?.trim()) {
    return res.status(400).json({ error: 'יש למלא שם קרן' });
  }
  db.prepare('UPDATE special_funds SET name = ?, description = ? WHERE id = ?')
    .run(name.trim(), description || '', Number(id));
  const fund = db.prepare('SELECT * FROM special_funds WHERE id = ?').get(Number(id));
  res.json(fund);
}));

router.delete('/funds/:id', wrapHandler((req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM special_funds WHERE id = ?').get(Number(id));
  if (!existing) return res.status(404).json({ error: 'קרן לא נמצאה' });
  db.prepare('DELETE FROM special_funds WHERE id = ?').run(Number(id));
  res.json({ success: true });
}));

// --- Special Payments CRUD ---

router.get('/', wrapHandler((req, res) => {
  const { fund_id, apartment_id } = req.query;
  let sql = `
    SELECT sp.*, a.number as apartment_number, a.owner_name,
           sf.name as fund_name
    FROM special_payments sp
    JOIN apartments a ON sp.apartment_id = a.id
    LEFT JOIN special_funds sf ON sp.fund_id = sf.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (fund_id) {
    if (fund_id === 'none') {
      sql += ' AND sp.fund_id IS NULL';
    } else {
      sql += ' AND sp.fund_id = ?';
      params.push(Number(fund_id));
    }
  }
  if (apartment_id) {
    sql += ' AND sp.apartment_id = ?';
    params.push(Number(apartment_id));
  }

  sql += ' ORDER BY sp.paid_date DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
}));

router.get('/export', wrapHandler((req, res) => {
  const { fund_id, apartment_id } = req.query;
  let sql = `
    SELECT sp.*, a.number as apartment_number, a.owner_name,
           sf.name as fund_name
    FROM special_payments sp
    JOIN apartments a ON sp.apartment_id = a.id
    LEFT JOIN special_funds sf ON sp.fund_id = sf.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (fund_id) {
    if (fund_id === 'none') {
      sql += ' AND sp.fund_id IS NULL';
    } else {
      sql += ' AND sp.fund_id = ?';
      params.push(Number(fund_id));
    }
  }
  if (apartment_id) {
    sql += ' AND sp.apartment_id = ?';
    params.push(Number(apartment_id));
  }
  sql += ' ORDER BY sp.paid_date DESC';

  const rows = db.prepare(sql).all(...params) as any[];

  const header = 'דירה,שם,קרן,סכום,תאריך תשלום,הערות';
  const csvRows = rows.map(r =>
    [r.apartment_number, r.owner_name, r.fund_name || 'אחר', r.amount, r.paid_date, r.notes].map(csvCell).join(',')
  );
  const csv = '\uFEFF' + [header, ...csvRows].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="special-payments.csv"');
  res.send(csv);
}));

router.post('/', wrapHandler((req, res) => {
  const { apartment_id, fund_id, amount, paid_date, notes } = req.body;
  if (!apartment_id || !amount || !paid_date) {
    return res.status(400).json({ error: 'שדות חובה חסרים' });
  }
  const result = db.prepare(
    'INSERT INTO special_payments (apartment_id, fund_id, amount, paid_date, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(Number(apartment_id), fund_id ? Number(fund_id) : null, Number(amount), paid_date, notes || '');

  const row = db.prepare(`
    SELECT sp.*, a.number as apartment_number, a.owner_name, sf.name as fund_name
    FROM special_payments sp
    JOIN apartments a ON sp.apartment_id = a.id
    LEFT JOIN special_funds sf ON sp.fund_id = sf.id
    WHERE sp.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(row);
}));

router.put('/:id', wrapHandler((req, res) => {
  const { id } = req.params;
  const { apartment_id, fund_id, amount, paid_date, notes } = req.body;

  const existing = db.prepare('SELECT id FROM special_payments WHERE id = ?').get(Number(id));
  if (!existing) return res.status(404).json({ error: 'תשלום מיוחד לא נמצא' });

  if (!apartment_id || !amount || !paid_date) {
    return res.status(400).json({ error: 'שדות חובה חסרים' });
  }

  db.prepare(
    'UPDATE special_payments SET apartment_id = ?, fund_id = ?, amount = ?, paid_date = ?, notes = ? WHERE id = ?'
  ).run(Number(apartment_id), fund_id ? Number(fund_id) : null, Number(amount), paid_date, notes || '', Number(id));

  const row = db.prepare(`
    SELECT sp.*, a.number as apartment_number, a.owner_name, sf.name as fund_name
    FROM special_payments sp
    JOIN apartments a ON sp.apartment_id = a.id
    LEFT JOIN special_funds sf ON sp.fund_id = sf.id
    WHERE sp.id = ?
  `).get(Number(id));
  res.json(row);
}));

router.delete('/:id', wrapHandler((req, res) => {
  const existing = db.prepare('SELECT id FROM special_payments WHERE id = ?').get(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: 'תשלום מיוחד לא נמצא' });
  db.prepare('DELETE FROM special_payments WHERE id = ?').run(Number(req.params.id));
  res.json({ success: true });
}));

router.post('/bulk-delete', wrapHandler((req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'יש לבחור לפחות פריט אחד' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const deleteMany = db.transaction((ids: number[]) => {
    const result = db.prepare(`DELETE FROM special_payments WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  });
  const deleted = deleteMany(ids);
  res.json({ success: true, deleted });
}));

export default router;
