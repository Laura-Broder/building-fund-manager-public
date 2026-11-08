import { Router } from 'express';
import db from '../db';
import { wrapHandler } from '../middleware';

const router = Router();

router.get('/', wrapHandler((req, res) => {
  const now = new Date();
  const month = req.query.month ? Number(req.query.month) : 0;
  const year = Number(req.query.year) || now.getFullYear();
  const isYearly = month === 0;

  const apartments = db.prepare('SELECT * FROM apartments ORDER BY CAST(number AS INTEGER), number').all() as any[];

  const payments = isYearly
    ? db.prepare(
        `SELECT p.*, a.number as apartment_number, a.owner_name
         FROM payments p JOIN apartments a ON p.apartment_id = a.id
         WHERE p.for_year = ?`
      ).all(year) as any[]
    : db.prepare(
        `SELECT p.*, a.number as apartment_number, a.owner_name
         FROM payments p JOIN apartments a ON p.apartment_id = a.id
         WHERE p.for_month = ? AND p.for_year = ?`
      ).all(month, year) as any[];

  // Build fee lookup from history — each entry applies from its effective date until the next entry
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

  const fee = getFeeForMonth(month || (now.getMonth() + 1), year);

  const totalCollected = payments.reduce((sum: number, p: any) => sum + p.amount, 0);
  const monthsInScope = isYearly
    ? (year === now.getFullYear() ? now.getMonth() + 1 : 12)
    : 1;

  let totalExpected = 0;
  if (isYearly) {
    for (let mi = 1; mi <= monthsInScope; mi++) {
      totalExpected += apartments.length * getFeeForMonth(mi, year);
    }
  } else {
    totalExpected = apartments.length * fee * monthsInScope;
  }

  // A month is paid only when its allocations cover the applicable fee.
  // Multiple partial payments combine; future months cannot replace unpaid ones.
  const monthlyPaidTotals = new Map<string, number>();
  for (const p of payments) {
    const key = `${p.apartment_id}-${p.for_month}`;
    monthlyPaidTotals.set(key, (monthlyPaidTotals.get(key) || 0) + p.amount);
  }
  const isFullyPaid = (apartmentId: number) => {
    for (let index = 0; index < monthsInScope; index++) {
      const coveredMonth = isYearly ? index + 1 : month;
      if ((monthlyPaidTotals.get(`${apartmentId}-${coveredMonth}`) || 0) < getFeeForMonth(coveredMonth, year)) {
        return false;
      }
    }
    return true;
  };
  const paidFullCount = apartments.filter(apt => isFullyPaid(apt.id)).length;

  const totalExpenses = isYearly
    ? db.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE strftime('%Y', date) = ?"
      ).get(String(year)) as any
    : db.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE strftime('%m', date) = ? AND strftime('%Y', date) = ?"
      ).get(String(month).padStart(2, '0'), String(year)) as any;

  const apartmentStatuses = apartments.map(apt => ({
    ...apt,
    paid: isFullyPaid(apt.id),
    payment_amount: payments
      .filter((p: any) => p.apartment_id === apt.id)
      .reduce((sum: number, p: any) => sum + p.amount, 0),
  }));

  // Debt calculation: from configured account start date, or earliest payment as fallback
  const accountStartMonth = db.prepare("SELECT value FROM settings WHERE key = 'account_start_month'").get() as any;
  const accountStartYear = db.prepare("SELECT value FROM settings WHERE key = 'account_start_year'").get() as any;
  const configuredStartMonth = accountStartMonth ? Number(accountStartMonth.value) : 0;
  const configuredStartYear = accountStartYear ? Number(accountStartYear.value) : 0;

  let startYear: number;
  let startMonth: number;

  if (configuredStartMonth >= 1 && configuredStartMonth <= 12 && configuredStartYear > 0) {
    startYear = configuredStartYear;
    startMonth = configuredStartMonth;
  } else {
    const earliest = db.prepare(
      'SELECT MIN(for_year) as min_year, MIN(for_month) as min_month FROM payments'
    ).get() as any;
    const earliestMonth = earliest?.min_year
      ? (db.prepare('SELECT MIN(for_month) as m FROM payments WHERE for_year = ?').get(earliest.min_year) as any)?.m || 1
      : null;
    startYear = earliest?.min_year || year;
    startMonth = earliestMonth || 1;
  }

  const allPayments = db.prepare(
    `SELECT apartment_id, for_year, for_month, SUM(amount) as total
     FROM payments
     GROUP BY apartment_id, for_year, for_month`
  ).all() as any[];

  const paidMap = new Map<string, number>();
  for (const p of allPayments) {
    paidMap.set(`${p.apartment_id}-${p.for_year}-${p.for_month}`, p.total);
  }

  // Load ownership history for debt segmentation
  const allOwnershipHistory = db.prepare(
    'SELECT * FROM ownership_history ORDER BY apartment_id, from_year ASC, from_month ASC'
  ).all() as any[];
  const ownershipMap = new Map<number, any[]>();
  for (const h of allOwnershipHistory) {
    if (!ownershipMap.has(h.apartment_id)) ownershipMap.set(h.apartment_id, []);
    ownershipMap.get(h.apartment_id)!.push(h);
  }

  function getOwnerForMonth(aptId: number, currentOwner: string, m: number, y: number): { name: string; isCurrent: boolean } {
    const history = ownershipMap.get(aptId);
    if (!history || history.length === 0) return { name: currentOwner, isCurrent: true };

    for (const entry of history) {
      const afterStart = y > entry.from_year || (y === entry.from_year && m >= entry.from_month);
      const beforeEnd = entry.to_year == null || y < entry.to_year || (y === entry.to_year && m <= entry.to_month);
      if (afterStart && beforeEnd) return { name: entry.owner_name, isCurrent: false };
    }
    return { name: currentOwner, isCurrent: true };
  }

  const endMonth = isYearly
    ? (year === now.getFullYear() ? now.getMonth() + 1 : 12)
    : month;

  const currentOwnerDebts: any[] = [];
  const previousOwnerDebts: any[] = [];

  for (const apt of apartments) {
    const currentUnpaid: { month: number; year: number }[] = [];
    let currentDebt = 0;
    const prevByOwner = new Map<string, { unpaidMonths: { month: number; year: number }[]; totalDebt: number }>();

    let y = startYear;
    let m = startMonth;
    while (y < year || (y === year && m <= endMonth)) {
      const monthFee = getFeeForMonth(m, y);
      const paid = paidMap.get(`${apt.id}-${y}-${m}`) || 0;
      if (paid < monthFee) {
        const owner = getOwnerForMonth(apt.id, apt.owner_name, m, y);
        const owed = monthFee - paid;
        if (owner.isCurrent) {
          currentUnpaid.push({ month: m, year: y });
          currentDebt += owed;
        } else {
          if (!prevByOwner.has(owner.name)) prevByOwner.set(owner.name, { unpaidMonths: [], totalDebt: 0 });
          const entry = prevByOwner.get(owner.name)!;
          entry.unpaidMonths.push({ month: m, year: y });
          entry.totalDebt += owed;
        }
      }
      m++;
      if (m > 12) { m = 1; y++; }
    }

    if (currentDebt > 0) {
      currentOwnerDebts.push({
        apartment_id: apt.id,
        number: apt.number,
        owner_name: apt.owner_name,
        unpaid_months: currentUnpaid,
        total_debt: currentDebt,
      });
    }

    for (const [ownerName, data] of prevByOwner) {
      previousOwnerDebts.push({
        apartment_id: apt.id,
        number: apt.number,
        owner_name: ownerName,
        unpaid_months: data.unpaidMonths,
        total_debt: data.totalDebt,
      });
    }
  }

  // Combined debts for backward compatibility
  const debts = [...currentOwnerDebts, ...previousOwnerDebts];

  // Lifetime totals
  const lifetimeCollected = (db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments').get() as any).total;
  const lifetimeExpenses = (db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM expenses').get() as any).total;
  const lifetimeTotalDebt = debts.reduce((sum: number, d: any) => sum + d.total_debt, 0);

  const lastUpdate = (db.prepare(
    `SELECT MAX(created_at) as last_update FROM (
      SELECT created_at FROM payments UNION ALL SELECT created_at FROM expenses
    )`
  ).get() as any)?.last_update || null;

  res.json({
    month,
    year,
    monthly_fee: fee,
    total_apartments: apartments.length,
    paid_count: paidFullCount,
    unpaid_count: apartments.length - paidFullCount,
    total_collected: totalCollected,
    total_expected: totalExpected,
    outstanding: totalExpected - totalCollected,
    total_expenses: totalExpenses.total,
    months_in_scope: monthsInScope,
    balance: totalCollected - totalExpenses.total,
    apartments: apartmentStatuses,
    lifetime_collected: lifetimeCollected,
    lifetime_expenses: lifetimeExpenses,
    lifetime_balance: lifetimeCollected - lifetimeExpenses,
    lifetime_total_debt: lifetimeTotalDebt,
    debts,
    current_owner_debts: currentOwnerDebts,
    previous_owner_debts: previousOwnerDebts,
    debt_start_month: startMonth,
    debt_start_year: startYear,
    last_update: lastUpdate,
  });
}));

export default router;
