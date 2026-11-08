import fs from 'fs';
import path from 'path';

// Demo data is deliberately artificial and must never replace a real database.
async function main() {
  const databasePath = path.join(__dirname, '..', 'data', 'building.db');
  if (fs.existsSync(databasePath)) {
    throw new Error('Demo setup requires a fresh copy with no database. Existing data was not changed.');
  }
  const { default: db, initDb } = await import('../src/db');
  initDb();
  const year = new Date().getFullYear();
  const lastMonth = new Date().getMonth() + 1;
  db.transaction(() => {
    const setting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    setting.run('building_name', 'בניין הדגמה — נתונים מלאכותיים');
    setting.run('monthly_fee', '320');
    setting.run('account_start_month', '1');
    setting.run('account_start_year', String(year));
    db.prepare('DELETE FROM monthly_fee_history').run();
    db.prepare('INSERT INTO monthly_fee_history (amount, effective_from_month, effective_from_year) VALUES (320, 1, ?)').run(year);
    const apartment = db.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)');
    const payment = db.prepare('INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
    const expense = db.prepare('INSERT INTO expenses (amount, category, description, date, vendor, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
    for (let n = 1; n <= 8; n++) {
      const id = apartment.run(String(n), `דייר לדוגמה ${n}`).lastInsertRowid;
      for (let month = 1; month <= lastMonth; month++) {
        if ((n + month) % 5 === 0) continue;
        const date = `${year}-${String(month).padStart(2, '0')}-05`;
        payment.run(id, n === 8 && month === lastMonth ? 160 : 320, date, month, year);
      }
    }
    for (let month = 1; month <= lastMonth; month++) {
      const date = `${year}-${String(month).padStart(2, '0')}-10`;
      expense.run(900, 'ניקיון', 'ניקיון — דוגמה מלאכותית', date, 'ספק לדוגמה');
      expense.run(180 + month * 17, 'חשמל ומים', 'חשמל — דוגמה מלאכותית', date, 'ספק לדוגמה');
      if (month % 3 === 0) expense.run(450, 'תחזוקה', 'תחזוקה — דוגמה מלאכותית', date, 'ספק לדוגמה');
    }
    const fund = db.prepare('INSERT INTO special_funds (name, description) VALUES (?, ?)').run('קרן הדגמה', 'נתונים מלאכותיים בלבד');
    db.prepare('INSERT INTO special_payments (apartment_id, fund_id, amount, paid_date, notes) VALUES (1, ?, 500, ?, ?)').run(fund.lastInsertRowid, `${year}-01-15`, 'תשלום הדגמה בלבד');
  })();
  db.close();
  console.log('Created synthetic demo data. No real residents or bank statements are included.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
