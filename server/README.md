# Server

Express 4 and TypeScript API with local SQLite persistence through better-sqlite3.

```bash
npm ci
npm run dev       # Loopback API at 127.0.0.1:3001
npm run build     # Compile into dist/
npm start         # Serve the API and previously built client
npm test          # Vitest + Supertest, in-memory route databases
```

The root `npm run build` builds both packages. API routes are mounted in `src/index.ts`; schema/defaults/migrations live in `src/db.ts`. Local Host/Origin checks are in `src/security.ts`; upload bounds are in `src/upload-limits.ts`. Errors use Hebrew client-facing messages and log only codes.

Data is stored under `data/`, never committed. This directory contains private financial records and source statements. Stop the server before backing it up. Do not reset an existing database as part of setup.

`npm run demo:seed` creates clearly artificial records only if no database exists. It refuses to overwrite an existing database.

See the [root README](../README.md), [engineering notes](../docs/engineering.md), [agent API reference](../AGENTS.md), and [security model](../SECURITY.md) for architecture, API details, setup, and known limitations.
