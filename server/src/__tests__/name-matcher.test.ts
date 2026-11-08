import { describe, it, expect, vi, beforeEach } from 'vitest';

const testDb = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE apartments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      owner_name TEXT NOT NULL
    );
    CREATE TABLE name_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      apartment_id INTEGER NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
      alias TEXT NOT NULL UNIQUE
    );
    CREATE TABLE expense_category_aliases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alias TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL
    );
  `);
  db.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)').run('1', 'יוסי כהן');
  db.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)').run('2', 'רחל לוי');
  db.prepare('INSERT INTO apartments (number, owner_name) VALUES (?, ?)').run('3', 'אברהם ישראלי');
  return db;
});

vi.mock('../db', () => ({ default: testDb }));

import { matchResident, saveAlias, matchExpenseCategory } from '../name-matcher';

describe('matchResident', () => {
  beforeEach(() => {
    testDb.prepare('DELETE FROM name_aliases').run();
  });

  it('returns null for empty input', () => {
    expect(matchResident('')).toBeNull();
    expect(matchResident('  ')).toBeNull();
  });

  it('matches exact owner name', () => {
    const result = matchResident('יוסי כהן');
    expect(result).not.toBeNull();
    expect(result!.owner_name).toBe('יוסי כהן');
    expect(result!.apartment_number).toBe('1');
    expect(result!.confidence).toBe('exact');
  });

  it('matches owner name as substring in description', () => {
    const result = matchResident('העברה מ יוסי כהן עבור ועד בית');
    expect(result).not.toBeNull();
    expect(result!.owner_name).toBe('יוסי כהן');
    expect(result!.confidence).toBe('substring');
  });

  it('matches when all name parts appear in description', () => {
    const result = matchResident('אברהם מבנק 004 ישראלי');
    expect(result).not.toBeNull();
    expect(result!.owner_name).toBe('אברהם ישראלי');
    expect(result!.confidence).toBe('substring');
  });

  it('matches by alias when no exact name match exists', () => {
    testDb.prepare('INSERT INTO name_aliases (apartment_id, alias) VALUES (?, ?)').run(1, 'יוסי מדירה 1');
    const result = matchResident('יוסי מדירה 1');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('alias');
    expect(result!.apartment_number).toBe('1');
  });

  it('alias takes precedence over exact name match', () => {
    testDb.prepare('INSERT INTO name_aliases (apartment_id, alias) VALUES (?, ?)').run(2, 'יוסי כהן');
    const result = matchResident('יוסי כהן');
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe('alias');
    expect(result!.apartment_number).toBe('2');
  });

  it('normalizes Hebrew final letters (sofit)', () => {
    // ך→כ normalization: "יוסי כהך" should still match "יוסי כהכ" after normalization
    testDb.prepare('INSERT INTO name_aliases (apartment_id, alias) VALUES (?, ?)').run(1, 'כהך');
    const result = matchResident('כהכ');
    expect(result).not.toBeNull();
    expect(result!.apartment_number).toBe('1');
  });

  it('returns null when no match found', () => {
    const result = matchResident('שם שלא קיים במערכת');
    expect(result).toBeNull();
  });
});

describe('saveAlias', () => {
  beforeEach(() => {
    testDb.prepare('DELETE FROM name_aliases').run();
  });

  it('saves a new alias', () => {
    saveAlias(1, 'כינוי חדש');
    const aliases = testDb.prepare('SELECT * FROM name_aliases WHERE apartment_id = 1').all() as any[];
    expect(aliases.length).toBe(1);
    expect(aliases[0].alias).toBe('כינוי חדש');
  });

  it('ignores blank aliases', () => {
    saveAlias(1, '   ');
    const aliases = testDb.prepare('SELECT * FROM name_aliases WHERE apartment_id = 1').all() as any[];
    expect(aliases.length).toBe(0);
  });

  it('ignores duplicate aliases silently', () => {
    saveAlias(1, 'כינוי');
    saveAlias(1, 'כינוי');
    const aliases = testDb.prepare('SELECT * FROM name_aliases').all() as any[];
    expect(aliases.length).toBe(1);
  });
});

describe('matchExpenseCategory', () => {
  beforeEach(() => {
    testDb.prepare('DELETE FROM expense_category_aliases').run();
  });

  it('returns null when no aliases exist', () => {
    expect(matchExpenseCategory('ניקיון', '')).toBeNull();
  });

  it('matches by expense category alias', () => {
    testDb.prepare('INSERT INTO expense_category_aliases (alias, category) VALUES (?, ?)').run('עמית ניקיון', 'ניקיון');
    const result = matchExpenseCategory('העברה', 'לטובת: עמית ניקיון עבור: ניקיון');
    expect(result).toBe('ניקיון');
  });

  it('matches alias in combined description+details text', () => {
    testDb.prepare('INSERT INTO expense_category_aliases (alias, category) VALUES (?, ?)').run('חשמל', 'חשמל ומים');
    const result = matchExpenseCategory('חשמל חודשי', '');
    expect(result).toBe('חשמל ומים');
  });
});
