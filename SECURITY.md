# Security and privacy

## Intended deployment

This application is for a trusted person using a local computer. The source may be public; the running financial application and its records must stay private. No external APIs or credentials are required.

The API listens on `127.0.0.1:3001`. It validates exact local Host and Origin values, rejects cross-site browser fetches, and sends no CORS permission headers. The frontend must use the documented local URLs or the Vite proxy. Framing is disallowed, API responses use `no-store`, and the compiled frontend receives a restrictive Content Security Policy.

There is no account login or role model. A trusted local CLI can use the API without an Origin header, and a process running under the same operating-system account can read and change records. Do not expose this service through a tunnel, public reverse proxy, or shared host. These browser protections are not a substitute for authentication.

## Data handling

- `server/data/building.db`, its journal sidecars, and `server/data/uploads/` contain private resident/financial data. They are ignored by Git.
- Database/upload directories and newly created data files use owner-only POSIX permissions. Windows permissions differ. Existing files and copied backups need their own access review.
- Uploaded statements are accepted as one CSV up to 5 MiB. Pending statements expire after ten minutes; at most ten pending files / 25 MiB of buffers are retained. Cleanup also runs periodically. This is not a full resource-exhaustion defense for untrusted remote clients.
- Pending data and stored statements are not encrypted. Deleting records/files is not guaranteed secure erasure, particularly with SQLite WAL files, SSDs, or backups.
- CSV exports quote fields and prefix formula-like text to prevent spreadsheet interpretation. Original statement downloads are unmodified bank files and are not rewritten or sanitized.
- Error responses avoid internal details; server error logs record codes rather than raw bank data, SQL values, or paths.
- Backups, exports, screenshots, test traces, and logs must be reviewed separately before sharing. Stop the server before making a consistent private backup of the complete data directory.

## Publication boundary

The publication copy excludes the historical bank-data generator, local databases, editor/assistant settings, reports, and the original `.git` directory. The original history contains sensitive source data. A new commit deleting that file is insufficient: use a fresh history from the sanitized copy.

Credential-pattern scans and manual inspection are heuristic. Zero dependency-audit findings means no advisories reported for the checked dependency tree at that time; it is not a guarantee of security. The proposed CI workflow audits the root and both packages.

## Known limits

Financial values use floating point, request validation is incomplete, and the import database/file writes are not one atomic operation. These are correctness/reliability constraints in addition to the local trust boundary. See [engineering notes](docs/engineering.md).

## Reporting an issue

Do not post real resident information, bank statements, databases, credentials, or exploit payloads containing personal records in public issues. Use synthetic reproductions. After publication, use GitHub's private vulnerability reporting if the repository owner has enabled it; that feature has not been enabled by this preparation.
