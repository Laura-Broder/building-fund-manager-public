# Proposed publication review

This document records the pre-publication review for Laura-Broder. At the time of review, no repository had been created, no visibility had changed, and no files had been pushed to GitHub. The owner subsequently approved publication of the sanitized candidate with fresh history.

Approved public repository name: **building-fund-manager-public**

Suggested description: **A Hebrew RTL app for Israeli building committees to track resident payments, expenses, bank CSV imports, and building finances.**

## Privacy boundary

The original upload contained a local financial database and a historical bank-data generator with identifiable names, transaction records, and a personal filesystem path. The candidate excludes the database and journal sidecars, uploads, the entire generator, editor/assistant settings, OS metadata, reports, and the original `.git` directory. Personal examples in parser comments were replaced with generic text. Screenshots and the optional demo seeder use explicitly artificial residents and amounts.

The generator is present in the original Git history. A deletion commit or `.gitignore` change does not remove it from earlier commits. Use fresh Git history from this sanitized candidate; do not copy back the original `.git` directory. The untouched upload is not a publication candidate.

A recognized credential/private-key pattern scan covered first-party source and 315 reachable historical blobs, without recognized token matches. That is a heuristic result, not proof every possible secret is absent. Small parser fixtures use generic sample names and round/example values; they appear synthetic, but were not verified against external identities.

The uploaded remote points to `Laura-Broder/building-fund-manager`. A read-only GitHub metadata request returned 404. This can mean a missing repository or a private repository inaccessible to the current connection; neither availability nor previous privacy/exposure could be established. No remote content was changed.

## Proposed code and repository changes

| Change | Purpose |
| --- | --- |
| README, engineering notes, SECURITY.md, component READMEs | Explain the implemented architecture, review paths, setup, trade-offs, and local threat model |
| Synthetic demo seeder and two real UI screenshots | Let reviewers evaluate populated screens without private records; seeder refuses an existing database |
| Expanded ignore rules and `.env.example` | Keep runtime data, credentials, reports, and local settings out of Git; document actual fixed configuration |
| Loopback binding, exact Host/Origin checks, cross-site rejection, no permissive CORS | Reduce network exposure and defend against browser-origin access and DNS rebinding |
| Browser response headers and API `no-store` | Constrain compiled frontend resources/framing and avoid API response caching |
| One CSV / 5 MiB upload limit, bounded temporary cache, expiry checks | Bound file and retained-buffer sizes and stop use of expired statement IDs |
| Owner-only POSIX data permissions and error-code-only logs | Reduce accidental filesystem disclosure and raw financial data in error logs |
| Shared CSV export escaping/formula neutralization | Prevent user text being interpreted as spreadsheet formulas; preserve numeric negatives |
| Full-payment calculations in dashboard and analytics | Sum allocations against each month's historical fee; partial payments do not count as fully paid |
| Apartment-test schema repair and security/financial regression tests | Restore failing history tests and check new boundaries and financial status behavior |
| Explicit callback dependencies | Resolve the five existing React Hook warnings without disabling the dependency rule |
| Updated dependencies, public registry lockfiles, Node version documentation | Remove reported advisories and make installation portable |
| Root build/start scripts and proposed CI workflow | Build both packages and express repeatable lint/test/build/audit/browser checks |

Existing application edits from the uploaded working tree were preserved. Broad feature rewrites, a new state management library, an ORM, and user-account authentication were not introduced.

Dependency updates include Vite 6 → 8, Vitest 3 → 5, React Router 6 → 7, Multer 1 → 2, and compatible React-plugin/jest-dom/type tooling updates. Root minimatch and server qs/esbuild overrides select patched transitive versions; re-evaluate those overrides during later dependency maintenance. Node.js 24 is the documented/tested runtime. These changes passed the checks below; they do not establish compatibility with every earlier Node version or operating system.

## Verified locally

Environment: Node.js 24.22.1, npm 11.9.0, Linux.

| Check | Result |
| --- | --- |
| Server unit/integration/security tests | 198 passed |
| Client unit/component/hook/API tests | 61 passed |
| Chromium end-to-end tests | 7 passed |
| Server TypeScript compilation and client TypeScript/Vite build | Passed |
| ESLint | 0 errors, 0 warnings |
| `npm audit` in root, server, and client | 0 reported vulnerabilities in each tree |
| Each lockfile checked with `npm ci --dry-run --ignore-scripts` | Passed |
| Ignore-policy checks for data/credentials and public examples | Passed |
| Demo creation on a fresh database | Passed |
| Demo refusal with an existing database | Passed; existing database hash unchanged |
| Compiled UI browser check | Dashboard and analytics render without page errors; hostile Origin rejected |
| Screenshots | Captured and visually reviewed with synthetic data |

The client bundle still triggers Vite's large-chunk warning (approximately 674 kB before gzip). No performance target or bundle optimization achievement is claimed. One client test intentionally renders a context consumer outside its provider and emits React diagnostics while passing. Vitest reports a future config-loader compatibility warning for the server's CommonJS package; current compilation and tests pass.

After publication, the initial GitHub run passed installation, lint, unit tests, builds, and dependency audits but failed to install Chromium because ubuntu-latest selected Ubuntu 26.04, unsupported by Playwright 1.58.2. The workflow now pins Ubuntu 24.04 and uses current first-party checkout/setup actions. See the repository Actions page for the latest run status. Audit results are a point-in-time advisory check, not a security guarantee.

## Remaining limits and approval items

1. **Local trust model:** no account login/roles. Local processes under the same OS account can access destructive APIs and private data. This is not approved for internet-facing deployment; remote hosting needs authentication, authorization, session and operational controls.
2. **Financial correctness scope:** amounts still use floating point and equal multi-month allocation without explicit cent-remainder rules. This is not a double-entry ledger or an immutable audit trail.
3. **Validation and recovery:** request validation and shared API types are incomplete. Financial writes and source-file/metadata persistence do not share one atomic transaction. See the engineering notes for the implications.
4. **Privacy after publication:** prior exposure, clones, and cached copies cannot be recalled by this local preparation. Review screenshots, exports, logs, and future commits separately. Do not restore old history.
5. **License:** no reuse license has been selected. Choose one before describing the project as open source; no license was added on the owner's behalf.

The owner reviewed the proposed README, source changes, and security assessment and subsequently approved public publication. The publication starts with fresh Git history; the original private history is excluded.
