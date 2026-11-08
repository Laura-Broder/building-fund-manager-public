import db from './db';

interface Apartment {
  id: number;
  number: string;
  owner_name: string;
}

interface Alias {
  apartment_id: number;
  alias: string;
}

export function normalize(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    // Normalize final Hebrew letters to their regular forms
    .replace(/ך/g, 'כ')
    .replace(/ם/g, 'מ')
    .replace(/ן/g, 'נ')
    .replace(/ף/g, 'פ')
    .replace(/ץ/g, 'צ')
    .toLowerCase();
}

export interface MatchResult {
  apartment_id: number;
  apartment_number: string;
  owner_name: string;
  confidence: 'alias' | 'exact' | 'substring' | 'none';
}

export function matchResident(description: string): MatchResult | null {
  if (!description || description.trim() === '') return null;

  const normalizedDesc = normalize(description);

  // 1. Check aliases first (highest confidence - previously confirmed)
  const aliases = db.prepare(
    `SELECT na.apartment_id, na.alias, a.number, a.owner_name
     FROM name_aliases na JOIN apartments a ON na.apartment_id = a.id`
  ).all() as (Alias & { number: string; owner_name: string })[];

  for (const alias of aliases) {
    if (normalizedDesc.includes(normalize(alias.alias)) || normalize(alias.alias).includes(normalizedDesc)) {
      return {
        apartment_id: alias.apartment_id,
        apartment_number: alias.number,
        owner_name: alias.owner_name,
        confidence: 'alias',
      };
    }
  }

  // 2. Check against apartment owner names
  const apartments = db.prepare('SELECT id, number, owner_name FROM apartments').all() as Apartment[];

  for (const apt of apartments) {
    const normalizedName = normalize(apt.owner_name);
    // Exact match
    if (normalizedDesc === normalizedName) {
      return {
        apartment_id: apt.id,
        apartment_number: apt.number,
        owner_name: apt.owner_name,
        confidence: 'exact',
      };
    }
  }

  // 3. Substring match (owner name appears in description or vice versa)
  for (const apt of apartments) {
    const normalizedName = normalize(apt.owner_name);
    if (normalizedName.length >= 3 && normalizedDesc.includes(normalizedName)) {
      return {
        apartment_id: apt.id,
        apartment_number: apt.number,
        owner_name: apt.owner_name,
        confidence: 'substring',
      };
    }
    // Check individual words of the owner name (first + last name)
    const nameParts = normalizedName.split(' ').filter(p => p.length >= 2);
    if (nameParts.length >= 2) {
      const allPartsMatch = nameParts.every(part => normalizedDesc.includes(part));
      if (allPartsMatch) {
        return {
          apartment_id: apt.id,
          apartment_number: apt.number,
          owner_name: apt.owner_name,
          confidence: 'substring',
        };
      }
    }
  }

  return null;
}

export function saveAlias(apartmentId: number, alias: string): void {
  const normalizedAlias = alias.trim();
  if (!normalizedAlias) return;
  try {
    db.prepare('INSERT OR IGNORE INTO name_aliases (apartment_id, alias) VALUES (?, ?)').run(apartmentId, normalizedAlias);
  } catch {
    // Ignore duplicate alias errors
  }
}

// Expense category alias matching — mirrors the name alias pattern
export function matchExpenseCategory(description: string, details: string): string | null {
  const text = `${description} ${details}`.trim();
  if (!text) return null;

  const normalizedText = normalize(text);

  const aliases = db.prepare('SELECT alias, category FROM expense_category_aliases').all() as { alias: string; category: string }[];

  for (const alias of aliases) {
    const normalizedAlias = normalize(alias.alias);
    if (normalizedText.includes(normalizedAlias) || normalizedAlias.includes(normalizedText)) {
      return alias.category;
    }
  }

  return null;
}

export function saveExpenseCategoryAlias(alias: string, category: string): void {
  const trimmed = alias.trim();
  if (!trimmed) return;
  try {
    db.prepare('INSERT OR IGNORE INTO expense_category_aliases (alias, category) VALUES (?, ?)').run(trimmed, category);
  } catch {
    // Ignore duplicate alias errors
  }
}
