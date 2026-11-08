import Papa from 'papaparse';
import iconv from 'iconv-lite';
import type { ColumnMapping } from './types';

export interface ParsedBankRow {
  date: string;
  description: string;
  details: string;
  sender_name: string;
  reference: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
}

function parseNumber(val: string | undefined): number | null {
  if (!val || val.trim() === '') return null;
  const cleaned = val.replace(/[,₪\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(val: string | undefined): string {
  if (!val || val.trim() === '') return '';
  const trimmed = val.trim();
  // Already ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  // Handle DD/MM/YYYY or DD/MM/YY format
  const parts = trimmed.split('/');
  if (parts.length === 3) {
    const [day, month, year_raw] = parts;
    let year = year_raw;
    if (year.length === 2) {
      year = '20' + year;
    }
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return trimmed;
}

// Extract the person/entity name from the פרטים (details) column.
// Patterns:
//   "המבצע: אטלס  סופיה ( שושנה ) עבור: שושי פברואר 24" → "אטלס סופיה"
//   "המבצע: דייר לדוגמה עבור: מבנק 004..." → "דייר לדוגמה"
//   "לטובת: ספק ניקיון לדוגמה עבור: ניקיון לדוגמה" → "ספק ניקיון לדוגמה"
function extractName(details: string): string {
  if (!details) return '';

  // Try "המבצע:" (sender — for incoming payments)
  let match = details.match(/המבצע:\s*(.+?)(?:\s*\(.*?\))?\s*(?:עבור:|$)/);
  if (match) return match[1].trim();

  // Try "לטובת:" (recipient — for outgoing expenses)
  match = details.match(/לטובת:\s*(.+?)(?:\s*\(.*?\))?\s*(?:עבור:|$)/);
  if (match) return match[1].trim();

  return '';
}

/** Detect encoding: try UTF-8 first, fall back to Windows-1255 */
function decodeBuffer(buffer: Buffer): string {
  let text = buffer.toString('utf-8');
  if (!text.includes('תאריך') && !text.includes('חובה')) {
    text = iconv.decode(buffer, 'windows-1255');
  }
  // Remove BOM if present
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  return text;
}

/** Find the header row index within the first 20 lines */
function findHeaderIndex(lines: string[]): number {
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    // Look for lines that look like CSV headers (contain commas and at least some non-empty fields)
    const fields = lines[i].split(',');
    if (fields.length >= 3 && fields.some(f => f.trim().length > 0)) {
      return i;
    }
  }
  return 0;
}

/** Preview a CSV file: returns headers and sample rows for column mapping */
export function previewCsv(buffer: Buffer): { headers: string[]; sampleRows: Record<string, string>[] } {
  const text = decodeBuffer(buffer);
  const lines = text.split(/\r?\n/);
  const headerIndex = findHeaderIndex(lines);
  const csvText = lines.slice(headerIndex).join('\n');

  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
  });

  const headers = result.meta.fields?.filter(h => h.length > 0) || [];
  const sampleRows = result.data.slice(0, 3).map(row => {
    const clean: Record<string, string> = {};
    for (const h of headers) {
      clean[h] = (row[h] || '').trim();
    }
    return clean;
  });

  return { headers, sampleRows };
}

/** Parse CSV with a user-provided column mapping */
export function parseCsvWithMapping(buffer: Buffer, mapping: ColumnMapping): ParsedBankRow[] {
  const text = decodeBuffer(buffer);
  const lines = text.split(/\r?\n/);
  const headerIndex = findHeaderIndex(lines);
  const csvText = lines.slice(headerIndex).join('\n');

  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
  });

  const rows: ParsedBankRow[] = [];
  for (const row of result.data) {
    const description = (row[mapping.description] || '').trim();
    const details = mapping.details ? (row[mapping.details] || '').trim() : '';
    const date = parseDate(row[mapping.date]);
    if (!date && !description) continue; // skip empty rows

    rows.push({
      date,
      description,
      details,
      sender_name: extractName(details),
      reference: mapping.reference ? (row[mapping.reference] || '').trim() : '',
      debit: mapping.debit ? parseNumber(row[mapping.debit]) : null,
      credit: mapping.credit ? parseNumber(row[mapping.credit]) : null,
      balance: mapping.balance ? parseNumber(row[mapping.balance]) : null,
    });
  }

  return rows;
}

/** Parse CSV using hardcoded Bank Hapoalim column names (legacy/fallback) */
export function parseBankCsv(buffer: Buffer): ParsedBankRow[] {
  return parseCsvWithMapping(buffer, {
    date: 'תאריך',
    description: 'תיאור הפעולה',
    details: 'פרטים',
    reference: 'אסמכתא',
    debit: 'חובה',
    credit: 'זכות',
    balance: 'יתרה',
  });
}
