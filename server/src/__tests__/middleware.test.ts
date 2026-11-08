import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { wrapHandler, errorHandler } from '../middleware';

function mockRes() {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis() as any,
    json: vi.fn().mockReturnThis() as any,
  };
  return res as Response;
}

describe('wrapHandler', () => {
  it('calls the handler and passes through on success', () => {
    const handler = vi.fn((_req, res) => res.json({ ok: true }));
    const wrapped = wrapHandler(handler);
    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn();

    wrapped(req, res, next);
    expect(handler).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards sync throws to next(err)', () => {
    const error = new Error('sync boom');
    const handler = vi.fn(() => { throw error; });
    const wrapped = wrapHandler(handler);
    const next = vi.fn();

    wrapped({} as Request, mockRes(), next);
    expect(next).toHaveBeenCalledWith(error);
  });

  it('forwards async rejections to next(err)', async () => {
    const error = new Error('async boom');
    const handler = vi.fn(async () => { throw error; });
    const wrapped = wrapHandler(handler);
    const next = vi.fn();

    wrapped({} as Request, mockRes(), next);
    await new Promise(r => setTimeout(r, 10));
    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('errorHandler', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns 409 for SQLITE_CONSTRAINT_UNIQUE', () => {
    const res = mockRes();
    errorHandler({ code: 'SQLITE_CONSTRAINT_UNIQUE' }, {} as Request, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'רשומה כפולה' });
  });

  it('returns 400 for SQLITE_CONSTRAINT_FOREIGNKEY', () => {
    const res = mockRes();
    errorHandler({ code: 'SQLITE_CONSTRAINT_FOREIGNKEY' }, {} as Request, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 500 for other SQLITE_ errors', () => {
    const res = mockRes();
    errorHandler({ code: 'SQLITE_ERROR' }, {} as Request, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'שגיאה בבסיס הנתונים' });
  });

  it('returns 404 for ENOENT', () => {
    const res = mockRes();
    errorHandler({ code: 'ENOENT' }, {} as Request, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'הקובץ לא נמצא' });
  });

  it('returns 500 for EACCES', () => {
    const res = mockRes();
    errorHandler({ code: 'EACCES' }, {} as Request, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'שגיאה בגישה לקובץ' });
  });

  it('returns 500 for unknown errors', () => {
    const res = mockRes();
    errorHandler(new Error('something'), {} as Request, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'שגיאת שרת פנימית' });
  });

  it('logs only a safe error code', () => {
    const err = new Error('test');
    errorHandler(err, {} as Request, mockRes(), vi.fn() as NextFunction);
    expect(consoleSpy).toHaveBeenCalledWith('Request failed', { code: 'INTERNAL_ERROR' });
  });
});
