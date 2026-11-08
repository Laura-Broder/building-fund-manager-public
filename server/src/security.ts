import type { RequestHandler } from 'express';

const allowedHosts = new Set(['localhost:3001', '127.0.0.1:3001']);
const allowedOrigins = new Set([
  'http://localhost:3001', 'http://127.0.0.1:3001',
  'http://localhost:5173', 'http://127.0.0.1:5173',
]);

// This is a single-user local application, not a remotely authenticated service.
// Validate Host independently of Origin to reject DNS rebinding requests.
export const localAccess: RequestHandler = (req, res, next) => {
  if (!allowedHosts.has((req.get('host') || '').toLowerCase())) {
    res.status(403).json({ error: 'גישה מותרת מהמחשב המקומי בלבד' });
    return;
  }
  const origin = req.get('origin');
  if ((origin && !allowedOrigins.has(origin)) || req.get('sec-fetch-site') === 'cross-site') {
    res.status(403).json({ error: 'הבקשה נחסמה מטעמי אבטחה' });
    return;
  }
  // No CORS headers: the UI uses same-origin requests or the Vite proxy.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
  next();
};
