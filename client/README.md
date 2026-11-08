# Client

Hebrew RTL React 18 application, built with TypeScript, Vite, Tailwind CSS, React Router, and Recharts.

```bash
npm ci
npm run dev       # localhost:5173; /api proxied to localhost:3001
npm run build     # TypeScript check and production assets
npm test          # Vitest + Testing Library
npm run test:e2e  # Playwright Chromium; starts the root development servers
```

Pages own their fetched data, filters, and forms. Shared hooks manage selection, sorting, and text search; `ModalContext` centralizes async confirmation/alert dialogs. HTTP calls are centralized in `src/api.ts`.

The interface uses `<html dir="rtl" lang="he">`. New user-facing messages should be Hebrew; number/date fields use left-to-right display. Keep currency and layout behavior consistent with the surrounding screen.

Browser tests use a real local database. Run them in a disposable copy without personal records. README screenshots use only the synthetic demo seeder.

See the [root README](../README.md) and [engineering notes](../docs/engineering.md) for the application architecture, page flow, trade-offs, and local setup.
