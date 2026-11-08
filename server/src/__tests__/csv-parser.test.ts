import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import { previewCsv, parseCsvWithMapping, parseBankCsv } from '../csv-parser';

const fixturesDir = path.join(__dirname, 'helpers', 'fixtures');
const bankCsv = fs.readFileSync(path.join(fixturesDir, 'bank-hapoalim.csv'));
const genericCsv = fs.readFileSync(path.join(fixturesDir, 'generic.csv'));

describe('previewCsv', () => {
  it('returns headers from bank CSV, skipping metadata rows', () => {
    const { headers } = previewCsv(bankCsv);
    expect(headers).toContain('תאריך');
    expect(headers).toContain('תיאור הפעולה');
    expect(headers).toContain('פרטים');
    expect(headers).toContain('זכות');
    expect(headers).toContain('חובה');
  });

  it('returns up to 3 sample rows', () => {
    const { sampleRows } = previewCsv(bankCsv);
    expect(sampleRows.length).toBeLessThanOrEqual(3);
    expect(sampleRows.length).toBeGreaterThan(0);
  });

  it('returns headers from generic CSV', () => {
    const { headers } = previewCsv(genericCsv);
    expect(headers).toContain('date');
    expect(headers).toContain('type');
    expect(headers).toContain('name');
  });
});

describe('parseBankCsv', () => {
  it('parses all data rows from bank CSV', () => {
    const rows = parseBankCsv(bankCsv);
    expect(rows.length).toBe(4);
  });

  it('converts DD/MM/YY dates to ISO format', () => {
    const rows = parseBankCsv(bankCsv);
    expect(rows[0].date).toBe('2024-01-15');
    expect(rows[1].date).toBe('2024-01-16');
  });

  it('parses credit amounts (incoming payments)', () => {
    const rows = parseBankCsv(bankCsv);
    expect(rows[0].credit).toBe(300);
    expect(rows[0].debit).toBeNull();
  });

  it('parses amounts with ₪ symbol and spaces', () => {
    const rows = parseBankCsv(bankCsv);
    expect(rows[1].credit).toBe(350.50);
  });

  it('parses debit amounts (outgoing expenses)', () => {
    const rows = parseBankCsv(bankCsv);
    expect(rows[2].debit).toBe(1200);
    expect(rows[2].credit).toBeNull();
  });

  it('extracts sender name from המבצע: pattern', () => {
    const rows = parseBankCsv(bankCsv);
    expect(rows[0].sender_name).toBe('יוסי כהן');
  });

  it('extracts recipient name from לטובת: pattern', () => {
    const rows = parseBankCsv(bankCsv);
    expect(rows[2].sender_name).toBe('עמית ניקיון');
  });

  it('extracts description column', () => {
    const rows = parseBankCsv(bankCsv);
    expect(rows[0].description).toBe('העברה-נייד');
    expect(rows[1].description).toBe('הוראת-קבע');
  });

  it('extracts reference numbers', () => {
    const rows = parseBankCsv(bankCsv);
    expect(rows[0].reference).toBe('1001');
  });
});

describe('parseCsvWithMapping', () => {
  it('parses generic CSV with custom column mapping', () => {
    const rows = parseCsvWithMapping(genericCsv, {
      date: 'date',
      description: 'type',
      details: 'name',
      reference: 'ref',
      credit: 'amount_in',
      debit: 'amount_out',
    });
    expect(rows.length).toBe(4);
  });

  it('passes through ISO dates unchanged', () => {
    const rows = parseCsvWithMapping(genericCsv, {
      date: 'date',
      description: 'type',
    });
    expect(rows[0].date).toBe('2024-01-15');
  });

  it('returns null for unmapped optional columns', () => {
    const rows = parseCsvWithMapping(genericCsv, {
      date: 'date',
      description: 'type',
    });
    expect(rows[0].credit).toBeNull();
    expect(rows[0].debit).toBeNull();
    expect(rows[0].balance).toBeNull();
    expect(rows[0].reference).toBe('');
  });

  it('skips rows where both date and description are empty', () => {
    const csv = Buffer.from('date,desc\n,\n2024-01-01,test\n');
    const rows = parseCsvWithMapping(csv, { date: 'date', description: 'desc' });
    expect(rows.length).toBe(1);
    expect(rows[0].description).toBe('test');
  });

  it('handles Windows-1255 encoded CSV', () => {
    const hebrewContent = 'תאריך,תיאור הפעולה,זכות\n15/01/24,העברה,300\n';
    const win1255Buffer = iconv.encode(hebrewContent, 'windows-1255');
    const rows = parseCsvWithMapping(win1255Buffer, {
      date: 'תאריך',
      description: 'תיאור הפעולה',
      credit: 'זכות',
    });
    expect(rows.length).toBe(1);
    expect(rows[0].credit).toBe(300);
  });
});
