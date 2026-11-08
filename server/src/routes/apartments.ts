import { Router } from 'express';
import db from '../db';
import { wrapHandler } from '../middleware';

const router = Router();

router.get('/', wrapHandler((_req, res) => {
  const apartments = db.prepare('SELECT * FROM apartments ORDER BY CAST(number AS INTEGER), number').all();
  res.json(apartments);
}));

router.post('/', wrapHandler((req, res) => {
  const { number, owner_name } = req.body;
  if (!number || !owner_name) {
    return res.status(400).json({ error: 'מספר דירה ושם בעלים נדרשים' });
  }
  const result = db.prepare(
    'INSERT INTO apartments (number, owner_name) VALUES (?, ?)'
  ).run(number, owner_name);
  const apartment = db.prepare('SELECT * FROM apartments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(apartment);
}));

router.post('/bulk-delete', wrapHandler((req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'יש לבחור לפחות פריט אחד' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const deleteMany = db.transaction((ids: number[]) => {
    const result = db.prepare(`DELETE FROM apartments WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  });
  const deleted = deleteMany(ids);
  res.json({ success: true, deleted });
}));

router.get('/:id/history', wrapHandler((req, res) => {
  const { id } = req.params;
  const apartment = db.prepare('SELECT * FROM apartments WHERE id = ?').get(Number(id)) as any;
  if (!apartment) return res.status(404).json({ error: 'דירה לא נמצאה' });

  const ownershipHistory = db.prepare(
    'SELECT * FROM ownership_history WHERE apartment_id = ? ORDER BY from_year ASC, from_month ASC'
  ).all(Number(id));

  const payments = db.prepare(
    'SELECT * FROM payments WHERE apartment_id = ? ORDER BY for_year ASC, for_month ASC'
  ).all(Number(id)) as any[];

  const feeHistory = db.prepare(
    'SELECT * FROM monthly_fee_history ORDER BY effective_from_year ASC, effective_from_month ASC'
  ).all() as any[];
  const fallbackFee = db.prepare("SELECT value FROM settings WHERE key = 'monthly_fee'").get() as any;
  const defaultFee = fallbackFee ? Number(fallbackFee.value) : 0;

  function getFeeForMonth(m: number, y: number): number {
    let applicable = defaultFee;
    for (const entry of feeHistory) {
      if (y > entry.effective_from_year || (y === entry.effective_from_year && m >= entry.effective_from_month)) {
        applicable = entry.amount;
      }
    }
    return applicable;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Determine year range from earliest payment or current year
  let minYear = currentYear;
  let maxYear = currentYear;
  for (const p of payments) {
    if (p.for_year < minYear) minYear = p.for_year;
    if (p.for_year > maxYear) maxYear = p.for_year;
  }

  // Build payment lookup: year-month -> total paid + payment list
  const paymentMap = new Map<string, { total: number; payments: any[] }>();
  for (const p of payments) {
    const key = `${p.for_year}-${p.for_month}`;
    if (!paymentMap.has(key)) paymentMap.set(key, { total: 0, payments: [] });
    const entry = paymentMap.get(key)!;
    entry.total += p.amount;
    entry.payments.push(p);
  }

  // Build year-by-year month grid
  const years: Record<number, Record<number, { expected: number; paid: number; status: string; payments: any[] }>> = {};

  for (let y = minYear; y <= maxYear; y++) {
    years[y] = {};
    const maxM = y === currentYear ? currentMonth : 12;
    for (let m = 1; m <= maxM; m++) {
      const expected = getFeeForMonth(m, y);
      const data = paymentMap.get(`${y}-${m}`);
      const paid = data?.total || 0;
      let status: string;
      if (paid >= expected) status = 'paid';
      else if (paid > 0) status = 'partial';
      else status = 'unpaid';

      years[y][m] = { expected, paid, status, payments: data?.payments || [] };
    }
  }

  const specialPayments = db.prepare(`
    SELECT sp.*, sf.name as fund_name
    FROM special_payments sp
    LEFT JOIN special_funds sf ON sp.fund_id = sf.id
    WHERE sp.apartment_id = ?
    ORDER BY sp.paid_date DESC
  `).all(Number(id)) as any[];

  res.json({ apartment, ownership_history: ownershipHistory, years, special_payments: specialPayments });
}));

router.put('/:id', wrapHandler((req, res) => {
  const { number, owner_name } = req.body;
  const { id } = req.params;
  db.prepare(
    'UPDATE apartments SET number = ?, owner_name = ? WHERE id = ?'
  ).run(number, owner_name, id);
  const apartment = db.prepare('SELECT * FROM apartments WHERE id = ?').get(id);
  if (!apartment) return res.status(404).json({ error: 'דירה לא נמצאה' });
  res.json(apartment);
}));

router.delete('/:id', wrapHandler((req, res) => {
  const { id } = req.params;
  const apartment = db.prepare('SELECT id FROM apartments WHERE id = ?').get(id);
  if (!apartment) return res.status(404).json({ error: 'דירה לא נמצאה' });
  db.prepare('DELETE FROM apartments WHERE id = ?').run(id);
  res.json({ success: true });
}));

router.get('/:id/ownership-history', wrapHandler((req, res) => {
  const { id } = req.params;
  const apartment = db.prepare('SELECT id FROM apartments WHERE id = ?').get(Number(id));
  if (!apartment) return res.status(404).json({ error: 'דירה לא נמצאה' });

  const history = db.prepare(
    'SELECT * FROM ownership_history WHERE apartment_id = ? ORDER BY from_year ASC, from_month ASC'
  ).all(Number(id));
  res.json(history);
}));

router.put('/:id/ownership-history/:historyId', wrapHandler((req, res) => {
  const { id, historyId } = req.params;
  const { owner_name, from_month, from_year, to_month, to_year } = req.body;

  if (!owner_name || !from_month || !from_year) {
    return res.status(400).json({ error: 'יש למלא שם דייר, חודש ושנת התחלה' });
  }
  if (from_month < 1 || from_month > 12) {
    return res.status(400).json({ error: 'חודש התחלה חייב להיות בין 1 ל-12' });
  }
  if (to_month != null && (to_month < 1 || to_month > 12)) {
    return res.status(400).json({ error: 'חודש סיום חייב להיות בין 1 ל-12' });
  }

  const entry = db.prepare(
    'SELECT * FROM ownership_history WHERE id = ? AND apartment_id = ?'
  ).get(Number(historyId), Number(id));
  if (!entry) return res.status(404).json({ error: 'רשומת דייר קודם לא נמצאה' });

  db.prepare(
    'UPDATE ownership_history SET owner_name = ?, from_month = ?, from_year = ?, to_month = ?, to_year = ? WHERE id = ?'
  ).run(owner_name, from_month, from_year, to_month ?? null, to_year ?? null, Number(historyId));

  const updated = db.prepare('SELECT * FROM ownership_history WHERE id = ?').get(Number(historyId));
  res.json(updated);
}));

router.delete('/:id/ownership-history/:historyId', wrapHandler((req, res) => {
  const { id, historyId } = req.params;

  const entry = db.prepare(
    'SELECT * FROM ownership_history WHERE id = ? AND apartment_id = ?'
  ).get(Number(historyId), Number(id));
  if (!entry) return res.status(404).json({ error: 'רשומת דייר קודם לא נמצאה' });

  db.prepare('DELETE FROM ownership_history WHERE id = ?').run(Number(historyId));
  res.json({ success: true });
}));

router.post('/:id/change-owner', wrapHandler((req, res) => {
  const { id } = req.params;
  const { new_owner_name, from_month, from_year } = req.body;

  if (!new_owner_name || !from_month || !from_year) {
    return res.status(400).json({ error: 'יש למלא שם דייר חדש, חודש ושנת מעבר' });
  }
  if (from_month < 1 || from_month > 12) {
    return res.status(400).json({ error: 'חודש חייב להיות בין 1 ל-12' });
  }

  const apartment = db.prepare('SELECT * FROM apartments WHERE id = ?').get(Number(id)) as any;
  if (!apartment) return res.status(404).json({ error: 'דירה לא נמצאה' });

  let toMonth = from_month - 1;
  let toYear = from_year;
  if (toMonth < 1) {
    toMonth = 12;
    toYear -= 1;
  }

  const changeOwner = db.transaction(() => {
    db.prepare(
      'INSERT INTO ownership_history (apartment_id, owner_name, from_month, from_year, to_month, to_year) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      Number(id),
      apartment.owner_name,
      1,
      2000,
      toMonth,
      toYear
    );

    const justInserted = db.prepare(
      'SELECT id FROM ownership_history WHERE apartment_id = ? ORDER BY id DESC LIMIT 1'
    ).get(Number(id)) as any;

    const previousEntry = db.prepare(
      'SELECT to_month, to_year FROM ownership_history WHERE apartment_id = ? AND id != ? ORDER BY to_year DESC, to_month DESC LIMIT 1'
    ).get(Number(id), justInserted.id) as any;

    if (previousEntry) {
      let startMonth = previousEntry.to_month + 1;
      let startYear = previousEntry.to_year;
      if (startMonth > 12) {
        startMonth = 1;
        startYear += 1;
      }
      db.prepare('UPDATE ownership_history SET from_month = ?, from_year = ? WHERE id = ?')
        .run(startMonth, startYear, justInserted.id);
    }

    db.prepare(
      'UPDATE apartments SET owner_name = ? WHERE id = ?'
    ).run(new_owner_name, Number(id));
  });

  changeOwner();

  const updated = db.prepare('SELECT * FROM apartments WHERE id = ?').get(Number(id));
  res.json(updated);
}));

export default router;
