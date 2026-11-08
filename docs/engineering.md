# Engineering notes

This document describes the implementation in the repository. It does not claim that the project implements a general ledger, distributed processing, machine learning, or production authentication.

## Data modeling and temporal behavior

`server/src/db.ts` defines the schema and startup migrations. `apartments` is the parent of monthly payments, ownership history, resident aliases, and special payments. Foreign keys cascade when an apartment is deleted. Special funds are separate: deleting a fund sets its linked payments' `fund_id` to NULL rather than removing those payments.

A payment has both its receipt date (`paid_date`) and the month/year it covers. `POST /api/payments` can split a transfer across several selected months inside a database transaction. Queries can then report collections by covered month without expanding allocations on every read.

Dashboard payment status and analytics collection rates count a month as fully paid only when its summed allocations meet that month's fee. Multiple partial payments can combine, while an overpayment in one month does not implicitly settle another.

`monthly_fee_history` models effective dates; dashboard calculations choose the fee applicable to each month. `ownership_history` retains earlier resident periods, allowing the dashboard to segment debt reporting by ownership. This is a useful distinction between current display data and historical obligations. It is not a complete audit trail: records can still be edited or deleted.

Amounts are SQLite REAL values and JavaScript numbers. Equal division of a payment can produce fractions of a shekel smaller than an agora. A stronger financial model would store integer agorot and specify how to allocate remainders. Changing that safely would require a migration and tests for existing allocations, refunds, and historical balances; it is intentionally not presented as solved here.

## Import pipeline

1. `POST /api/upload/preview` accepts a bounded CSV, detects/decodes text, skips bank metadata rows, and returns column names plus sample rows. It retains the source buffer under an opaque UUID.
2. The frontend maps columns and calls `/parse`. Dates and numeric fields are parsed; direction is classified from credit/debit values.
3. `name-matcher.ts` applies saved aliases before exact/substring matching. Normalization handles spacing, case, and Hebrew final-form letters. Category keywords and aliases provide expense suggestions.
4. The user reviews matches and covered months. Uncertain records can remain `pending_review`.
5. `/confirm` checks duplicates and writes the selected records in one SQLite transaction, then saves the original statement and upload metadata.

Reference plus date is the duplicate key checked within the appropriate transaction type. It is not a universal bank transaction identifier. Missing references and distinct operations sharing the same reference/date remain limitations; the user review step matters.

The database transaction covers the financial writes, not the filesystem. A later disk-write or upload-metadata failure can leave committed records without their source file. A possible improvement is a staged-file workflow with explicit recovery state. Likewise, confirm operations are not backed by a globally unique import idempotency key.

Pending uploads have a ten-minute lifetime, a five-MiB per-file bound, a ten-file bound, and a 25-MiB aggregate bound. A periodic cleanup releases stale buffers; parse/confirm also reject expired IDs. These limits control this local workflow but do not constitute a complete internet-facing denial-of-service defense.

## Frontend state and API boundary

Each React page owns its fetched records, filters, modal/form state, and refresh actions. `useSelection` prunes selections that are no longer in the current items. `useTextFilter` and `useSort` share table behavior without introducing a global state store. `ModalContext` exposes promise-based alerts/confirmations so an action can await the user's choice.

Fetch calls are centralized in `client/src/api.ts`. The generic request helper consistently parses errors, but many resource functions still expose `any`. There is no generated or shared client/server schema. Stronger request validation and explicit DTOs are a sensible next step; TypeScript alone does not validate incoming JSON.

Page-local state makes the flow easy to follow for this application size. The trade-offs are manual refreshes after mutations and repeated fetching; there is no shared query cache or automatic invalidation layer. Callback dependencies are explicit, rather than suppressing hook dependency warnings.

## Local deployment boundary

The compiled Express application serves the React assets and `/api`; Vite supplies a same-origin proxy in development. The API accepts only its expected local Host values and known UI Origins. Cross-site fetch metadata is rejected. This defends against browser-origin access and DNS rebinding while preserving local CLI use without browser headers.

These checks are not user authentication. Another process under the same user account can call the API, including destructive routes. Remote deployment would need a different trust boundary, authentication, authorization, session handling, and operational controls. Local permission bits reduce accidental cross-user file access on POSIX systems; they do not encrypt data or protect a compromised account.

## Verification strategy

- Parsing and matching tests cover encodings, dates, aliases, and Hebrew normalization.
- Supertest route tests use isolated in-memory SQLite schemas.
- Security tests exercise hostile origins/hosts, oversized and invalid uploads, bounded pending statements, expiry, and spreadsheet formula neutralization.
- Client tests cover shared UI, hooks, context, and the API wrapper.
- Chromium tests exercise dashboard navigation and resident/payment/expense workflows against the real API.
- The demo seeder refuses any existing database. Screenshots use only explicitly artificial records.

The suite does not establish full route coverage. In particular, the import confirmation workflow and recovery from database/filesystem partial failures would benefit from additional integration coverage.
