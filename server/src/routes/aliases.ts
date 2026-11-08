import { Router } from 'express';
import db from '../db';
import { wrapHandler } from '../middleware';

const router = Router();

router.get('/', wrapHandler((_req, res) => {
  const aliases = db.prepare(
    `SELECT na.*, a.number as apartment_number, a.owner_name
     FROM name_aliases na
     JOIN apartments a ON na.apartment_id = a.id
     ORDER BY CAST(a.number AS INTEGER), a.number`
  ).all();
  res.json(aliases);
}));

router.post('/bulk-delete', wrapHandler((req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'יש לבחור לפחות פריט אחד' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const deleteMany = db.transaction((ids: number[]) => {
    const result = db.prepare(`DELETE FROM name_aliases WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  });
  const deleted = deleteMany(ids);
  res.json({ success: true, deleted });
}));

router.delete('/:id', wrapHandler((req, res) => {
  const alias = db.prepare('SELECT id FROM name_aliases WHERE id = ?').get(req.params.id);
  if (!alias) return res.status(404).json({ error: 'כינוי לא נמצא' });
  db.prepare('DELETE FROM name_aliases WHERE id = ?').run(req.params.id);
  res.json({ success: true });
}));

// Expense category aliases
router.get('/expense-categories', wrapHandler((_req, res) => {
  const aliases = db.prepare('SELECT * FROM expense_category_aliases ORDER BY category, alias').all();
  res.json(aliases);
}));

router.post('/expense-categories/bulk-delete', wrapHandler((req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'יש לבחור לפחות פריט אחד' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const deleteMany = db.transaction((ids: number[]) => {
    const result = db.prepare(`DELETE FROM expense_category_aliases WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  });
  const deleted = deleteMany(ids);
  res.json({ success: true, deleted });
}));

router.delete('/expense-categories/:id', wrapHandler((req, res) => {
  const alias = db.prepare('SELECT id FROM expense_category_aliases WHERE id = ?').get(req.params.id);
  if (!alias) return res.status(404).json({ error: 'כינוי קטגוריה לא נמצא' });
  db.prepare('DELETE FROM expense_category_aliases WHERE id = ?').run(req.params.id);
  res.json({ success: true });
}));

export default router;
