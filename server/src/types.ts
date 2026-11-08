export interface Apartment {
  id: number;
  number: string;
  owner_name: string;
}

export interface Payment {
  id: number;
  apartment_id: number;
  amount: number;
  paid_date: string;
  for_month: number;
  for_year: number;
  notes: string;
  source: 'manual' | 'csv';
  status: 'confirmed' | 'pending_review';
}

export interface Expense {
  id: number;
  amount: number;
  category: string;
  description: string;
  date: string;
  vendor: string;
  source: 'manual' | 'csv';
  status: 'confirmed' | 'pending_review';
}

export interface Setting {
  key: string;
  value: string;
}

export interface NameAlias {
  id: number;
  apartment_id: number;
  alias: string;
}

export interface ParsedTransaction {
  date: string;
  description: string;
  details: string;
  sender_name: string;
  reference: string;
  debit: number | null;
  credit: number | null;
  balance: number | null;
  type: 'payment' | 'expense';
  matched_apartment_id: number | null;
  matched_apartment_name: string | null;
  matched_apartment_number: string | null;
  suggested_months: { month: number; year: number }[];
  suggested_category: string;
  category_alias_match: boolean;
  already_imported: boolean;
}

export interface ConfirmRow {
  date: string;
  description: string;
  sender_name?: string;
  reference: string;
  type: 'payment' | 'expense';
  amount: number;
  apartment_id?: number;
  months?: { month: number; year: number }[];
  category?: string;
  vendor?: string;
  save_alias?: boolean;
  save_category_alias?: boolean;
  pending_review?: boolean;
}

export interface UploadedFile {
  id: number;
  filename: string;
  original_name: string;
  size: number;
  upload_date: string;
  payments_imported: number;
  expenses_imported: number;
}

export interface ColumnMapping {
  date: string;
  description: string;
  details?: string;
  reference?: string;
  debit?: string;
  credit?: string;
  balance?: string;
}

