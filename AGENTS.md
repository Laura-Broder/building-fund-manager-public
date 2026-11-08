# AGENTS.md

Instructions for AI coding agents working in this repository.

## What This App Does

A local-only management tool for Israeli building committees (ועד בית). A building manager uses it to:

1. Track which apartments paid their monthly fee and which didn't
2. Track building expenses (cleaning, maintenance, etc.)
3. Import bank statements (CSV from Bank Hapoalim) to auto-classify payments and expenses instead of doing it manually

The user is a Hebrew speaker. All UI text, error messages, form labels, and database category values are in Hebrew.

## Running

```bash
npm run dev          # Starts server (port 3001) + client (port 5173) concurrently
npm run dev:server   # Server only, with tsx watch for live reload
npm run dev:client   # Client only, Vite dev server
npm run build        # Type-check and build server + client
npm run lint         # ESLint across entire repo
```

**Linting:** ESLint 9 flat config at `eslint.config.mjs`. Uses `typescript-eslint` recommended rules (with `no-explicit-any` off) and `eslint-plugin-react-hooks` for client files. Run `npm run lint` from root, or `npm run lint` within `server/` or `client/` to lint each package individually.

**Testing:** Vitest is used for both packages. Run tests with:

```bash
npm test             # Run all tests (server + client sequentially)
npm run test:server  # Server tests only
npm run test:client  # Client tests only
```

Or within each package: `cd server && npm test` / `cd client && npm test`. Use `npm run test:watch` in either package for watch mode.

Verify changes compile with `cd server && npx tsc --noEmit` and `cd client && npx tsc --noEmit`.

### Testing

- **Server tests** use Vitest with `better-sqlite3` in-memory databases (`:memory:`) and `supertest` for HTTP route tests. Modules that import `db` are tested by mocking `../db` with `vi.mock()` and `vi.hoisted()` to inject an in-memory DB. Test files live in `server/src/__tests__/`. Fixtures (CSV files) are in `server/src/__tests__/helpers/fixtures/`.
- **Client tests** use Vitest with `jsdom` environment, `@testing-library/react` for component/hook tests, and `@testing-library/user-event` for simulating interactions. `@testing-library/jest-dom` matchers are set up globally via `client/src/test-setup.ts`. Test files are co-located next to their source files (e.g. `useSelection.test.ts` next to `useSelection.ts`).
- **E2E tests** use Playwright with Chromium. Test files live in `client/e2e/`. Run with:

```bash
npm run test:e2e      # Run all E2E tests (from root or client/)
npm run test:e2e:ui   # Interactive Playwright UI runner (client/ only)
```

The `webServer` config in `client/playwright.config.ts` auto-starts `npm run dev` (server + client) before tests. If the dev server is already running, it reuses it (`reuseExistingServer: true`). Tests hit the real SQLite DB and clean up their own test data via API calls in `beforeEach`/`afterAll` hooks. Test apartments use high numbers (990, 991) and test expenses use a recognizable description prefix to avoid collisions with real data.

Dashboard full-payment status sums allocations per apartment/month and compares each scoped month against its historical fee. The existence of a partial payment must not mark a month paid.

## Local security boundary

The API listens only on `127.0.0.1:3001`. `src/security.ts` checks exact Host and Origin allowlists and blocks cross-site browser requests; no CORS headers are enabled. The Vite proxy provides same-origin API access during development. This is still a trusted local single-user application without account authentication.

CSV uploads accept one `.csv` file up to 5 MiB, no additional multipart fields, and reject binary NUL content. Pending statements expire after ten minutes and are capped at ten files / 25 MiB total. Expired IDs cannot be parsed or confirmed. CSV exports use `csvCell()` to quote fields and neutralize spreadsheet formulas. API errors log only error codes, never raw errors containing financial data.

`npm run demo:seed` creates artificial data only when no database exists. Never add a reset or overwrite flag to this command. Screenshots must use these synthetic records.

## Architecture

Monorepo with two packages. No shared code package — types are defined separately in each.

### Server (`server/`)

Express + TypeScript, run via `tsx`. SQLite database at `server/data/building.db` using `better-sqlite3` (synchronous API — no async/await for DB calls).

- `src/db.ts` — Single `db` instance exported as default. Schema initialized with `CREATE TABLE IF NOT EXISTS` on startup. WAL mode and foreign keys enabled.
- `src/middleware.ts` — `wrapHandler(handler)` wraps sync route handlers in try/catch (Express 4 doesn't auto-catch sync throws). `errorHandler` is a global error middleware that maps error codes to Hebrew messages and HTTP status codes (409 unique constraint, 400 FK constraint, 404 ENOENT, 500 other DB/FS errors).
- `src/routes/*.ts` — Each file exports an Express `Router`. Mounted in `src/index.ts` under `/api/<name>`. All handlers are wrapped with `wrapHandler`.
- `src/csv-parser.ts` — Parses Bank Hapoalim CSV buffers. Handles encoding detection (UTF-8 vs Windows-1255), BOM removal, metadata row skipping, Hebrew date format (DD/MM/YY) conversion to ISO.
- `src/name-matcher.ts` — Matches bank transaction descriptions to residents. Priority: saved aliases > exact name match > substring match. Uses Hebrew-aware normalization (final letters ך→כ, ם→מ, etc.). Also exports `matchExpenseCategory()` for expense alias matching and `normalize()` (used by the upload parse route for keyword matching).
- `src/defaults.ts` — Shared constants: `DEFAULT_CATEGORIES` (expense category names) and `DEFAULT_SETTINGS` (initial settings key-value pairs). Used by `db.ts` for seeding and by the reset endpoint for re-seeding after deletion.
- `src/types.ts` — TypeScript interfaces. The client does NOT import from here — it uses `any` types via `api.ts`.

**Route pattern:** All routes use parameterized queries (`?` placeholders) for SQL. Multi-row writes use `db.transaction()` for atomicity. GET endpoints build SQL dynamically with `WHERE 1=1` + conditional `AND` clauses for filters. All handlers are wrapped with `wrapHandler` from `middleware.ts`. DELETE and PATCH endpoints check for existence first and return 404 with a Hebrew message if not found. The global `errorHandler` catches any uncaught errors (DB constraint violations, file system errors) and returns `{ error: "Hebrew message" }` — the client's `api.ts` already displays these.

**Bulk endpoints:** Each resource has `POST /bulk-delete` (and `POST /bulk-approve` for payments/expenses). These accept `{ ids: number[] }`, validate the array is non-empty, and wrap the operation in `db.transaction()`. They use POST (not DELETE) because DELETE with a request body is poorly supported. The files bulk-delete also removes files from disk.

**Payments are stored per-month.** When a resident pays for multiple months, the POST handler creates one row per month with `amount / months.length` each. The API accepts `{ months: [{month, year}, ...] }` not `for_month`/`for_year` directly.

### Client (`client/`)

React 18 + Vite + Tailwind CSS. No state management library — each page fetches its own data with `useEffect` + local `useState`.

- `src/api.ts` — All HTTP calls go through here. Uses a generic `request<T>()` wrapper around `fetch`. File uploads (`uploadCsv`) use `FormData` directly (no JSON content-type header).
- `src/pages/*.tsx` — One file per page, self-contained with their own state and forms. Pages call `api.ts` functions directly.
- `src/components/Layout.tsx` — Sidebar navigation + content area. Wraps all pages via `App.tsx`.
- `src/components/FileList.tsx` — Standalone file history table component. Accepts a `refreshTrigger` prop to re-fetch after uploads. Rendered inside the Upload page below the drop zone (hidden during wizard steps).
- `src/components/BulkActionBar.tsx` — Fixed bottom bar for bulk actions. Appears when rows are selected. Used across all data table pages.
- `src/components/Modal.tsx` — Reusable modal dialog component with alert (single OK button) and confirm (OK + Cancel) modes. Supports keyboard (Enter/Escape) and backdrop click to dismiss.
- `src/context/ModalContext.tsx` — `ModalProvider` wraps the app in `App.tsx` and renders the modal at the root level. Exposes a `useModal()` hook with `showAlert(msg): Promise<void>` and `showConfirm(msg): Promise<boolean>`. All pages use this instead of `window.alert()`/`window.confirm()`.
- `src/hooks/useSelection.ts` — Shared hook managing a `Set<number>` of selected row IDs. Provides toggle, toggleAll, clear, isSelected, isAllSelected, count, selectedArray. Auto-prunes stale IDs when the items array changes (e.g. after a filter change). Used by Payments, Expenses, Residents, FileList, and Settings pages.
- `src/hooks/useTextFilter.ts` — Shared hook for client-side text search across table rows. Accepts an items array and a list of field names, returns `searchText`, `setSearchText`, and `filteredItems`. Used by Payments, Expenses, and Residents pages.
- `src/components/ApartmentHistory.tsx` — Standalone component showing per-apartment payment history. Displays ownership timeline, year-by-year month grid (green=paid, yellow=partial, red=unpaid), clickable cells with payment details, and a special payments list. Rendered inline on the Residents page.
- `src/pages/SpecialPayments.tsx` — Page for managing extra payments beyond the monthly fee. Includes fund management (create/delete named funds displayed as chips), payment CRUD with fund/apartment filters, text search, sorting, bulk delete, and CSV export.
- `src/pages/Analytics.tsx` — Analytics page with 4 recharts visualizations: collection rate line chart, income vs. expenses bar chart, expense category pie chart, and running balance area chart. Year range selector controls all charts.
- Vite proxies `/api` → `http://localhost:3001` in dev (see `vite.config.ts`).

**No component library.** All UI is built with Tailwind utility classes directly in JSX.

## Critical Rules

### Hebrew and RTL

- `index.html` has `<html dir="rtl" lang="he">`. All new UI text must be in Hebrew.
- Number inputs and date inputs get `dir="ltr"` attribute to display correctly.
- Currency is always `₪` (Israeli Shekel), displayed with `dir="ltr"` on the container.
- Expense categories are stored in the `expense_categories` DB table and managed via the Settings page. Default categories are seeded in `db.ts`. The client fetches categories dynamically from `GET /api/expenses/categories`.
- The name matcher normalizes Hebrew final-form letters (sofit) before comparing. Any new matching logic must use the same `normalize()` function in `name-matcher.ts`.

### Database

- Schema lives in `db.ts` `initDb()`. New tables/columns go there using `CREATE TABLE IF NOT EXISTS` or manual migration logic. Tables: `apartments`, `payments`, `expenses`, `settings`, `name_aliases`, `expense_category_aliases`, `expense_categories`, `uploaded_files`, `monthly_fee_history`, `ownership_history`, `expense_category_keywords`, `recurring_expenses`, `special_funds`, `special_payments`.
- `better-sqlite3` is synchronous — do NOT use `async/await` with `db.prepare().run()` or `.all()`. They return results directly.
- Dates stored as ISO strings (`YYYY-MM-DD`). Months as integers 1-12.
- The `source` column on `payments` and `expenses` tracks origin: `"manual"` or `"csv"`. Preserve this when adding new entry methods.
- The `status` column on `payments` and `expenses` tracks review state: `"confirmed"` (default) or `"pending_review"`. Items flagged during CSV import get `pending_review` and can be approved via `PATCH /:id/approve`.
- Deleting an apartment cascades to its payments, special_payments, and name_aliases (ON DELETE CASCADE).
- The `monthly_fee_history` table stores historical fee amounts with `effective_from_month`/`effective_from_year`. Each entry applies from its effective date until the next entry. The dashboard debt calculation and CSV import month suggestion use this table instead of a flat fee. The `monthly_fee` setting is kept in sync as a convenience shortcut for the latest fee.
- The `ownership_history` table tracks previous apartment owners. When an owner changes via `POST /api/apartments/:id/change-owner`, the old owner is archived with `to_month`/`to_year` and the `apartments.owner_name` is updated to the new owner. The dashboard segments debts into `current_owner_debts` and `previous_owner_debts` based on ownership periods. Deleting an apartment cascades to its ownership_history (ON DELETE CASCADE).
- The `special_funds` table defines named purposes for extra payments beyond the monthly fee (e.g. renovation fund, elevator fund). The `special_payments` table stores actual payments linked to an apartment and optionally to a fund. `fund_id` is nullable (NULL = generic "other" payment). Deleting a fund sets `fund_id` to NULL on its payments (ON DELETE SET NULL). These payments are completely separate from the monthly fee system — they do not affect debt calculations or analytics.
- The `account_start_month` and `account_start_year` settings define when the building account started. When set, the dashboard uses them as the start date for debt calculation instead of deriving it from the earliest payment. Stored as strings in the `settings` table (empty string = not set).

### CSV Import Flow

The import is a three-step API process — agents must understand all steps:

1. `POST /api/upload/preview` — Accepts multipart file upload. Returns `{ fileId, headers, sampleRows }`. The file buffer is stored in memory for 10 minutes (kept until confirm or expiry).
2. `POST /api/upload/parse` — Accepts `{ fileId, mapping: ColumnMapping }` (JSON). Uses the stored file + user's column mapping to parse. Returns `{ transactions: ParsedTransaction[] }` with auto-matched apartments and suggested months/categories. Expense category suggestions use: saved `expense_category_aliases` first, then configurable `expense_category_keywords` from the DB (managed in Settings). Nothing is saved to the DB yet.
3. `POST /api/upload/confirm` — Accepts `{ rows: ConfirmRow[], fileId?: string }` after user review. This is what actually inserts payments/expenses and optionally saves name aliases. When `fileId` is provided, the original CSV is saved to `server/data/uploads/` and tracked in the `uploaded_files` table for later download/deletion via the file list on the Upload page ("ייבוא קבצים").

The client's Upload page manages the review state across these three calls (upload → mapping → review → confirm). The column mapping step auto-detects Bank Hapoalim headers but lets users map columns manually for other banks.

### Bank CSV Format

Bank Hapoalim CSVs have Hebrew column headers. The parser detects encoding and finds the header row by scanning for known headers (first 20 lines). Key columns:

- `פרטים` (details) = contains the sender/recipient name — this is the primary field for resident matching
- `זכות` (credit) = incoming money = resident payment
- `חובה` (debit) = outgoing money = building expense
- `תיאור הפעולה` (description) = transaction type (e.g., העברה-נייד, הוראת-קבע)
- Dates may be `DD/MM/YY`, `DD/MM/YYYY`, or `YYYY-MM-DD`

The `פרטים` column contains structured text like `המבצע: שם השולח עבור: תיאור` for payments and `לטובת: שם המוטב עבור: תיאור` for expenses. The `extractName()` function in `csv-parser.ts` parses these patterns to extract the person's name. Name matching uses `sender_name` (extracted from `פרטים`), falling back to `description` if `פרטים` is empty.

The column mapping feature (`ColumnMapping` in `types.ts`) allows any CSV structure. The `parseCsvWithMapping()` function in `csv-parser.ts` handles generic CSV parsing with user-provided column names. `parseBankCsv()` is a convenience wrapper with hardcoded Bank Hapoalim column names.

## API Endpoints

| Method | Path | Body/Params |
|--------|------|-------------|
| GET | `/api/apartments` | — |
| POST | `/api/apartments` | `{ number, owner_name }` |
| PUT | `/api/apartments/:id` | `{ number, owner_name }` |
| DELETE | `/api/apartments/:id` | — |
| POST | `/api/apartments/bulk-delete` | `{ ids: number[] }` |
| GET | `/api/apartments/:id/history` | — (full payment history: month grid with paid/unpaid/partial status, ownership timeline, fee lookup, special payments list) |
| GET | `/api/apartments/:id/ownership-history` | — (list past owners for apartment) |
| PUT | `/api/apartments/:id/ownership-history/:historyId` | `{ owner_name, from_month, from_year, to_month?, to_year? }` — update a past owner entry |
| DELETE | `/api/apartments/:id/ownership-history/:historyId` | — (delete a past owner entry) |
| POST | `/api/apartments/:id/change-owner` | `{ new_owner_name, from_month, from_year }` — archives current owner, updates apartment |
| GET | `/api/payments` | `?month=&year=&apartment_id=&status=` |
| POST | `/api/payments` | `{ apartment_id, amount, paid_date, months: [{month,year}], notes?, source? }` |
| PUT | `/api/payments/:id` | `{ apartment_id, amount, paid_date, for_month, for_year, notes? }` |
| PATCH | `/api/payments/:id/approve` | — (sets status to 'confirmed') |
| DELETE | `/api/payments/:id` | — |
| POST | `/api/payments/bulk-delete` | `{ ids: number[] }` |
| GET | `/api/payments/export` | `?month=&year=&apartment_id=&status=` — returns CSV file with current filters applied |
| POST | `/api/payments/bulk-approve` | `{ ids: number[] }` |
| GET | `/api/expenses` | `?category=&from=&to=&status=` |
| POST | `/api/expenses` | `{ amount, category, description?, date, vendor?, source? }` |
| PUT | `/api/expenses/:id` | `{ amount, category, description?, date, vendor? }` |
| PATCH | `/api/expenses/:id` | `{ category }` — update category only (used by inline dropdown) |
| PATCH | `/api/expenses/:id/approve` | — (sets status to 'confirmed') |
| DELETE | `/api/expenses/:id` | — |
| POST | `/api/expenses/bulk-delete` | `{ ids: number[] }` |
| GET | `/api/expenses/export` | `?category=&from=&to=&status=` — returns CSV file with current filters applied |
| POST | `/api/expenses/bulk-approve` | `{ ids: number[] }` |
| GET | `/api/expenses/categories` | — |
| POST | `/api/expenses/categories` | `{ name }` |
| DELETE | `/api/expenses/categories/:id` | — |
| GET | `/api/analytics` | `?from_year=&to_year=&from_month=&to_month=` — monthly collection rate, income/expenses, category breakdown, running balance |
| GET | `/api/dashboard` | `?month=&year=` |
| GET | `/api/settings` | — |
| PUT | `/api/settings` | `{ key: value, ... }` — updating `monthly_fee` auto-syncs the latest `monthly_fee_history` entry |
| GET | `/api/settings/fee-history` | — (list fee history entries, sorted by date ascending) |
| POST | `/api/settings/fee-history` | `{ amount, effective_from_month, effective_from_year }` — upserts; syncs `monthly_fee` setting to latest entry |
| DELETE | `/api/settings/fee-history/:id` | — (syncs `monthly_fee` setting to new latest entry) |
| GET | `/api/settings/category-keywords` | — (list keyword-to-category mappings for CSV import) |
| POST | `/api/settings/category-keywords` | `{ keyword, category }` |
| DELETE | `/api/settings/category-keywords/:id` | — |
| GET | `/api/settings/recurring-expenses` | — (list recurring expense definitions) |
| POST | `/api/settings/recurring-expenses` | `{ description, category, expected_amount, vendor?, frequency? }` |
| DELETE | `/api/settings/recurring-expenses/:id` | — |
| POST | `/api/settings/reset` | `{ entities: string[] }` — deletes all data for selected entities. Resetting `expense_categories` also clears `expense_category_aliases`. Valid entities include `fee_history`, `ownership_history`, `category_keywords`, `recurring_expenses`, `special_payments`, `special_funds`. |
| POST | `/api/upload/preview` | multipart `file` field; one CSV, max 5 MiB; 413 oversize, 429 cache full |
| POST | `/api/upload/parse` | `{ fileId, mapping: ColumnMapping }` |
| POST | `/api/upload/confirm` | `{ rows: ConfirmRow[], fileId?: string }` |
| GET | `/api/files` | — (list uploaded files) |
| GET | `/api/files/:id/download` | — (download original CSV) |
| DELETE | `/api/files/:id` | — (delete file from disk + DB, keeps imported transactions) |
| POST | `/api/files/bulk-delete` | `{ ids: number[] }` |
| GET | `/api/aliases` | — |
| DELETE | `/api/aliases/:id` | — |
| POST | `/api/aliases/bulk-delete` | `{ ids: number[] }` |
| GET | `/api/aliases/expense-categories` | — |
| DELETE | `/api/aliases/expense-categories/:id` | — |
| POST | `/api/aliases/expense-categories/bulk-delete` | `{ ids: number[] }` |
| GET | `/api/special-payments` | `?fund_id=&apartment_id=` — list special payments (fund_id=none for unassigned) |
| POST | `/api/special-payments` | `{ apartment_id, fund_id?, amount, paid_date, notes? }` |
| PUT | `/api/special-payments/:id` | `{ apartment_id, fund_id?, amount, paid_date, notes? }` |
| DELETE | `/api/special-payments/:id` | — |
| POST | `/api/special-payments/bulk-delete` | `{ ids: number[] }` |
| GET | `/api/special-payments/export` | `?fund_id=&apartment_id=` — returns CSV file with current filters applied |
| GET | `/api/special-payments/funds` | — (list all special funds) |
| POST | `/api/special-payments/funds` | `{ name, description? }` |
| PUT | `/api/special-payments/funds/:id` | `{ name, description? }` |
| DELETE | `/api/special-payments/funds/:id` | — (payments keep with null fund_id) |

## Keeping Docs in Sync

When making code changes, check if `AGENTS.md` needs updating. In particular:

- New or changed API endpoints → update the API table above
- New/renamed DB tables or columns → update the Database section
- Changed dev commands or ports → update the Running section
- New expense categories or settings keys → update the Critical Rules section
- Changes to the CSV import flow or name matching logic → update the relevant sections
