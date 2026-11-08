import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import db from '../db';
import { wrapHandler } from '../middleware';
import type { UploadedFile } from '../types';

const router = Router();
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');

// List all uploaded files
router.get('/', wrapHandler((_req, res) => {
  const files = db.prepare('SELECT * FROM uploaded_files ORDER BY upload_date DESC').all() as UploadedFile[];
  res.json(files);
}));

// Download a file
router.get('/:id/download', wrapHandler((req, res) => {
  const file = db.prepare('SELECT * FROM uploaded_files WHERE id = ?').get(req.params.id) as UploadedFile | undefined;
  if (!file) {
    return res.status(404).json({ error: 'הקובץ לא נמצא' });
  }

  const filePath = path.join(UPLOADS_DIR, file.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'הקובץ לא נמצא בדיסק' });
  }

  const encodedName = encodeURIComponent(file.original_name);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.sendFile(filePath);
}));

// Bulk delete files
router.post('/bulk-delete', wrapHandler((req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'יש לבחור לפחות פריט אחד' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const files = db.prepare(`SELECT * FROM uploaded_files WHERE id IN (${placeholders})`).all(...ids) as UploadedFile[];
  const deleteMany = db.transaction((files: UploadedFile[]) => {
    for (const file of files) {
      const filePath = path.join(UPLOADS_DIR, file.filename);
      try { fs.unlinkSync(filePath); } catch { /* ignore missing file */ }
    }
    const result = db.prepare(`DELETE FROM uploaded_files WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  });
  const deleted = deleteMany(files);
  res.json({ success: true, deleted });
}));

// Delete a file
router.delete('/:id', wrapHandler((req, res) => {
  const file = db.prepare('SELECT * FROM uploaded_files WHERE id = ?').get(req.params.id) as UploadedFile | undefined;
  if (!file) {
    return res.status(404).json({ error: 'הקובץ לא נמצא' });
  }

  // Delete from disk (ignore if already missing)
  const filePath = path.join(UPLOADS_DIR, file.filename);
  try { fs.unlinkSync(filePath); } catch { /* ignore missing file */ }

  // Delete DB record
  db.prepare('DELETE FROM uploaded_files WHERE id = ?').run(req.params.id);
  res.json({ success: true });
}));

export default router;
