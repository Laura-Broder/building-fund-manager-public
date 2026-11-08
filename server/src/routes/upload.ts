import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import db from '../db';
import { csvUpload, MAX_PENDING_BYTES, MAX_PENDING_FILES, UPLOAD_TTL_MS } from '../upload-limits';
import { previewCsv, parseCsvWithMapping } from '../csv-parser';
import { matchResident, saveAlias, matchExpenseCategory, saveExpenseCategoryAlias, normalize } from '../name-matcher';
import { wrapHandler } from '../middleware';
import type { ParsedTransaction, ConfirmRow, ColumnMapping } from '../types';

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true, mode: 0o700 });
}

fs.chmodSync(UPLOADS_DIR, 0o700);

const router = Router();

// Temporary in-memory file storage for the preview→parse→confirm flow
const tempFiles = new Map<string, { buffer: Buffer; originalName: string; expires: number }>();

function cleanExpiredFiles() {
  const now = Date.now();
  for (const [id, entry] of tempFiles) {
    if (entry.expires < now) tempFiles.delete(id);
  }
}

// Release expired statements even when no further uploads arrive.
const cleanupTimer = setInterval(cleanExpiredFiles, 60_000);
cleanupTimer.unref();

// Preview endpoint: returns CSV headers + sample rows, stores file for subsequent parse
router.post('/preview', csvUpload, wrapHandler((req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'לא הועלה קובץ' });
  }

  cleanExpiredFiles();
  const pendingBytes = [...tempFiles.values()].reduce((total, entry) => total + entry.buffer.length, 0);
  if (tempFiles.size >= MAX_PENDING_FILES || pendingBytes + req.file.buffer.length > MAX_PENDING_BYTES) {
    return res.status(429).json({ error: 'יותר מדי קבצים ממתינים, יש להמתין או להשלים את הייבוא' });
  }
  if (req.file.buffer.includes(0)) {
    return res.status(400).json({ error: 'יש להעלות קובץ CSV טקסטואלי' });
  }

  const { headers, sampleRows } = previewCsv(req.file.buffer);
  const fileId = crypto.randomUUID();
  tempFiles.set(fileId, {
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    expires: Date.now() + UPLOAD_TTL_MS,
  });

  res.json({ fileId, headers, sampleRows });
}));

// Parse endpoint: uses stored file + column mapping to parse transactions
router.post('/parse', wrapHandler((req, res) => {
  const { fileId, mapping } = req.body as { fileId: string; mapping: ColumnMapping };

  if (!fileId || !mapping) {
    return res.status(400).json({ error: 'חסר fileId או מיפוי עמודות' });
  }

  cleanExpiredFiles();
  const entry = tempFiles.get(fileId);
  if (!entry) {
    return res.status(400).json({ error: 'הקובץ פג תוקף, יש להעלות מחדש' });
  }

  const rows = parseCsvWithMapping(entry.buffer, mapping);

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

  // Build sets of existing composite keys (reference|date) for duplicate detection.
  // Reference numbers alone aren't globally unique — banks reuse them across statements.
  const existingPaymentKeys = new Set(
    (db.prepare("SELECT reference, paid_date FROM payments WHERE source = 'csv' AND reference != ''").all() as any[])
      .map((r: any) => `${r.reference}|${r.paid_date}`)
  );
  const existingExpenseKeys = new Set(
    (db.prepare("SELECT reference, date FROM expenses WHERE source = 'csv' AND reference != ''").all() as any[])
      .map((r: any) => `${r.reference}|${r.date}`)
  );

  const categoryKeywords = db.prepare('SELECT keyword, category FROM expense_category_keywords').all() as { keyword: string; category: string }[];

  const transactions: ParsedTransaction[] = rows.map(row => {
    const isPayment = row.credit !== null && row.credit > 0;
    const amount = isPayment ? row.credit! : (row.debit || 0);

    let matched_apartment_id: number | null = null;
    let matched_apartment_name: string | null = null;
    let matched_apartment_number: string | null = null;
    const suggested_months: { month: number; year: number }[] = [];

    if (isPayment) {
      // Match using sender_name (extracted from פרטים) first, fall back to description
      const matchText = row.sender_name || row.description;
      const match = matchResident(matchText);
      if (match) {
        matched_apartment_id = match.apartment_id;
        matched_apartment_name = match.owner_name;
        matched_apartment_number = match.apartment_number;
      }

      // Suggest months based on amount and applicable fee for the transaction date
      const rowDate = row.date ? new Date(row.date) : new Date();
      const rowMonth = rowDate.getMonth() + 1;
      const rowYear = rowDate.getFullYear();
      const fee = getFeeForMonth(rowMonth, rowYear);

      if (fee > 0 && amount > 0) {
        const numMonths = Math.round(amount / fee);
        const startMonth = rowMonth;
        const startYear = rowYear;

        for (let i = 0; i < Math.max(1, numMonths); i++) {
          let m = startMonth + i;
          let y = startYear;
          while (m > 12) {
            m -= 12;
            y += 1;
          }
          suggested_months.push({ month: m, year: y });
        }
      }
    }

    // Suggest category for expenses — check aliases first, then configurable keywords
    let suggested_category = 'אחר';
    let category_alias_match = false;
    if (!isPayment) {
      const aliasCategory = matchExpenseCategory(row.description, row.details);
      if (aliasCategory) {
        suggested_category = aliasCategory;
        category_alias_match = true;
      } else {
        const text = normalize(`${row.description} ${row.details}`);
        for (const kw of categoryKeywords) {
          if (text.includes(normalize(kw.keyword))) {
            suggested_category = kw.category;
            break;
          }
        }
      }
    }

    // Duplicate detection: use reference + date to avoid false positives from reused reference numbers.
    const already_imported = row.reference
      ? (isPayment
        ? existingPaymentKeys.has(`${row.reference}|${row.date}`)
        : existingExpenseKeys.has(`${row.reference}|${row.date}`))
      : false;

    return {
      date: row.date,
      description: row.description,
      details: row.details,
      sender_name: row.sender_name,
      reference: row.reference,
      debit: row.debit,
      credit: row.credit,
      balance: row.balance,
      type: isPayment ? 'payment' : 'expense',
      matched_apartment_id,
      matched_apartment_name,
      matched_apartment_number,
      suggested_months,
      suggested_category,
      category_alias_match,
      already_imported,
    };
  });

  res.json({ transactions });
}));

router.post('/confirm', wrapHandler((req, res) => {
  cleanExpiredFiles();
  const { rows, fileId } = req.body as { rows: ConfirmRow[]; fileId?: string };
  if (fileId && !tempFiles.has(fileId)) {
    return res.status(400).json({ error: 'הקובץ פג תוקף, יש להעלות מחדש' });
  }
  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).json({ error: 'אין שורות לאישור' });
  }

  const insertPayment = db.prepare(
    "INSERT INTO payments (apartment_id, amount, paid_date, for_month, for_year, notes, source, reference, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)"
  );
  const insertExpense = db.prepare(
    "INSERT INTO expenses (amount, category, description, date, vendor, source, reference, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)"
  );
  const checkPaymentRef = db.prepare(
    "SELECT 1 FROM payments WHERE reference = ? AND paid_date = ? AND source = 'csv' AND reference != '' LIMIT 1"
  );
  const checkExpenseRef = db.prepare(
    "SELECT 1 FROM expenses WHERE reference = ? AND date = ? AND source = 'csv' AND reference != '' LIMIT 1"
  );

  const processAll = db.transaction((rows: ConfirmRow[]) => {
    let paymentsAdded = 0;
    let expensesAdded = 0;
    let skippedDuplicates = 0;

    for (const row of rows) {
      if (row.type === 'payment' && row.apartment_id && row.months && row.months.length) {
        // Skip if already imported
        if (row.reference && checkPaymentRef.get(row.reference, row.date)) {
          skippedDuplicates++;
          continue;
        }
        const amountPerMonth = Math.round((row.amount / row.months.length) * 100) / 100;
        const status = row.pending_review ? 'pending_review' : 'confirmed';
        for (const m of row.months) {
          insertPayment.run(row.apartment_id, amountPerMonth, row.date, m.month, m.year, row.sender_name || row.description, 'csv', row.reference || '', status);
        }
        paymentsAdded += row.months.length;

        // Save alias using sender_name (extracted from פרטים), fall back to description
        if (row.save_alias) {
          const aliasText = row.sender_name || row.description;
          if (aliasText) saveAlias(row.apartment_id, aliasText);
        }
      } else if (row.type === 'expense') {
        // Skip if already imported
        if (row.reference && checkExpenseRef.get(row.reference, row.date)) {
          skippedDuplicates++;
          continue;
        }
        const expenseStatus = row.pending_review ? 'pending_review' : 'confirmed';
        insertExpense.run(row.amount, row.category || 'אחר', row.description, row.date, row.vendor || '', 'csv', row.reference || '', expenseStatus);
        expensesAdded++;

        // Save expense category alias using vendor/recipient name (not the generic transaction type)
        const expenseAliasText = row.sender_name || row.description;
        if (row.save_category_alias && expenseAliasText && row.category) {
          saveExpenseCategoryAlias(expenseAliasText, row.category);
        }
      }
    }

    return { paymentsAdded, expensesAdded, skippedDuplicates };
  });

  const result = processAll(rows);

  // Save the original CSV file to disk if fileId is provided
  let savedFileId: number | undefined;
  const tempEntry = fileId ? tempFiles.get(fileId) : undefined;
  if (tempEntry) {
    const diskFilename = crypto.randomUUID() + '.csv';
    fs.writeFileSync(path.join(UPLOADS_DIR, diskFilename), tempEntry.buffer, { mode: 0o600 });
    const insertFile = db.prepare(
      'INSERT INTO uploaded_files (filename, original_name, size, payments_imported, expenses_imported) VALUES (?, ?, ?, ?, ?)'
    );
    const fileResult = insertFile.run(diskFilename, tempEntry.originalName, tempEntry.buffer.length, result.paymentsAdded, result.expensesAdded);
    savedFileId = fileResult.lastInsertRowid as number;
    tempFiles.delete(fileId!);
  }

  res.json({ success: true, ...result, savedFileId });
}));

export default router;
