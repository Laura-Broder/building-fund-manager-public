import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps a sync Express route handler in try/catch so that thrown errors
 * are forwarded to Express error middleware via next(err).
 * Needed because Express 4 does NOT auto-catch sync throws.
 */
export function wrapHandler(handler: (req: Request, res: Response, next: NextFunction) => any): RequestHandler {
  return (req, res, next) => {
    try {
      const result = handler(req, res, next);
      // If handler returns a promise (async), catch its rejections too
      if (result && typeof result.catch === 'function') {
        result.catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Express 4-arg error middleware. Returns { error: "Hebrew message" }
 * with the appropriate status code based on error type.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  // Avoid logging request contents, SQL values, bank data or filesystem paths.
  console.error('Request failed', { code: err.code || err.type || 'INTERNAL_ERROR' });

  if (err.code === 'LIMIT_FILE_SIZE' || err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'הבקשה גדולה מדי; גודל קובץ מרבי הוא 5 מגה בייט' });
  }
  if (err.code === 'INVALID_CSV' || err.code?.startsWith('LIMIT_') || err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'בקשה לא תקינה; יש להעלות קובץ CSV יחיד' });
  }

  const code: string = err.code || '';

  if (code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'רשומה כפולה' });
  }
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return res.status(400).json({ error: 'קיים קשר לנתונים אחרים' });
  }
  if (code.startsWith('SQLITE_')) {
    return res.status(500).json({ error: 'שגיאה בבסיס הנתונים' });
  }
  if (code === 'ENOENT') {
    return res.status(404).json({ error: 'הקובץ לא נמצא' });
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return res.status(500).json({ error: 'שגיאה בגישה לקובץ' });
  }

  return res.status(500).json({ error: 'שגיאת שרת פנימית' });
}
