import multer from 'multer';
import path from 'path';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_PENDING_BYTES = 25 * 1024 * 1024;
export const MAX_PENDING_FILES = 10;
export const UPLOAD_TTL_MS = 10 * 60 * 1000;

export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1 },
  fileFilter: (_req, file, callback) => {
    if (path.extname(file.originalname).toLowerCase() !== '.csv') {
      callback(Object.assign(new Error('CSV required'), { code: 'INVALID_CSV' }));
      return;
    }
    callback(null, true);
  },
}).single('file');
