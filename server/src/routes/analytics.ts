import { Router } from 'express';
import db from '../db';
import { wrapHandler } from '../middleware';

const router = Router();

router.get('/', wrapHandler((req, res) => {
  const fromYear = Number(req.query.from_year) || new Date().getFullYear();
  const toYear = Number(req.query.to_year) || fromYear;
  const fromMonth = Number(req.query.from_month) || 1;
  const toMonth = Number(req.query.to_month) || 12;

  const apartments = db.prepare('SELECT * FROM apartments').all() as any[];
  const totalApartments = apartments.length;

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

  // Aggregate payments by month
  const allPayments = db.prepare(
    `SELECT for_year, for_month, apartment_id, SUM(amount) as total
     FROM payments
     WHERE (for_year > ? OR (for_year = ? AND for_month >= ?))
       AND (for_year < ? OR (for_year = ? AND for_month <= ?))
     GROUP BY for_year, for_month, apartment_id`
  ).all(fromYear, fromYear, fromMonth, toYear, toYear, toMonth) as any[];

  // Aggregate income by month
  const monthlyIncome = db.prepare(
    `SELECT for_year as year, for_month as month, SUM(amount) as total
     FROM payments
     WHERE (for_year > ? OR (for_year = ? AND for_month >= ?))
       AND (for_year < ? OR (for_year = ? AND for_month <= ?))
     GROUP BY for_year, for_month
     ORDER BY for_year, for_month`
  ).all(fromYear, fromYear, fromMonth, toYear, toYear, toMonth) as any[];

  // Aggregate expenses by month
  const monthlyExpenses = db.prepare(
    `SELECT CAST(strftime('%Y', date) AS INTEGER) as year,
            CAST(strftime('%m', date) AS INTEGER) as month,
            SUM(amount) as total
     FROM expenses
     WHERE date >= ? AND date <= ?
     GROUP BY year, month
     ORDER BY year, month`
  ).all(
    `${fromYear}-${String(fromMonth).padStart(2, '0')}-01`,
    `${toYear}-${String(toMonth).padStart(2, '0')}-31`
  ) as any[];

  // Expense breakdown by category
  const categoryBreakdown = db.prepare(
    `SELECT category, SUM(amount) as total
     FROM expenses
     WHERE date >= ? AND date <= ?
     GROUP BY category
     ORDER BY total DESC`
  ).all(
    `${fromYear}-${String(fromMonth).padStart(2, '0')}-01`,
    `${toYear}-${String(toMonth).padStart(2, '0')}-31`
  ) as any[];

  // Build month-by-month data
  const paidApartmentsPerMonth = new Map<string, Set<number>>();
  for (const p of allPayments) {
    if (p.total < getFeeForMonth(p.for_month, p.for_year)) continue;
    const key = `${p.for_year}-${p.for_month}`;
    if (!paidApartmentsPerMonth.has(key)) paidApartmentsPerMonth.set(key, new Set());
    paidApartmentsPerMonth.get(key)!.add(p.apartment_id);
  }

  const incomeMap = new Map<string, number>();
  for (const r of monthlyIncome) incomeMap.set(`${r.year}-${r.month}`, r.total);
  const expenseMap = new Map<string, number>();
  for (const r of monthlyExpenses) expenseMap.set(`${r.year}-${r.month}`, r.total);

  const monthly: any[] = [];
  let runningBalance = 0;
  let y = fromYear;
  let m = fromMonth;
  while (y < toYear || (y === toYear && m <= toMonth)) {
    const key = `${y}-${m}`;
    const income = incomeMap.get(key) || 0;
    const expenses = expenseMap.get(key) || 0;
    const paidCount = paidApartmentsPerMonth.get(key)?.size || 0;
    const collectionRate = totalApartments > 0 ? Math.round((paidCount / totalApartments) * 100) : 0;
    const expected = totalApartments * getFeeForMonth(m, y);
    runningBalance += income - expenses;

    monthly.push({
      year: y, month: m,
      income, expenses, expected,
      collection_rate: collectionRate,
      paid_count: paidCount,
      balance: runningBalance,
    });

    m++;
    if (m > 12) { m = 1; y++; }
  }

  res.json({
    from_year: fromYear, from_month: fromMonth,
    to_year: toYear, to_month: toMonth,
    total_apartments: totalApartments,
    monthly,
    category_breakdown: categoryBreakdown,
  });
}));

export default router;
