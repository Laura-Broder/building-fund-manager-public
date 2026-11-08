import express from 'express';
import path from 'path';
import { initDb } from './db';
import apartmentsRouter from './routes/apartments';
import paymentsRouter from './routes/payments';
import expensesRouter from './routes/expenses';
import dashboardRouter from './routes/dashboard';
import settingsRouter from './routes/settings';
import uploadRouter from './routes/upload';
import aliasesRouter from './routes/aliases';
import filesRouter from './routes/files';
import analyticsRouter from './routes/analytics';
import specialPaymentsRouter from './routes/special-payments';
import { errorHandler } from './middleware';
import { localAccess } from './security';

const app = express();
const PORT = 3001;

app.disable('x-powered-by');
app.use(localAccess);
app.use(express.json({ limit: '5mb' }));

// Initialize database
initDb();

// API routes
app.use('/api/apartments', apartmentsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/aliases', aliasesRouter);
app.use('/api/files', filesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/special-payments', specialPaymentsRouter);

// Error handling middleware (must be after all route mounts)
app.use(errorHandler);

// Serve static files in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
