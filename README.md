# Invoice Maker

Invoicing SaaS for Indonesian freelancers: manage clients and a service catalog, set up payment
accounts and a business profile, and (in later plans) create, send and track invoices. The UI is
available in Bahasa Indonesia (default) and English; money is stored as integer minor units and
dates are shown in Asia/Jakarta.

Design spec: `docs/superpowers/specs/2026-10-21-invoice-maker-mvp-design.md`.
Current plan: `docs/superpowers/plans/2026-10-21-plan-1-fondasi-data-master.md`.

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS 4 · Drizzle ORM + PostgreSQL
(`postgres` driver) · Better Auth (email + password) · next-intl · Vitest · Playwright.

## Local setup

Requires Node.js 22 and PostgreSQL 16.

```bash
npm install
scripts/setup-local-db.sh   # starts Postgres, creates invoice_dev, invoice_test, invoice_e2e, writes .env.local
npm run db:migrate          # applies migrations to invoice_dev
npm run dev                 # http://localhost:3000
```

### Environment variables

Copy `.env.example` to `.env.local` (the setup script does this for you):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | App database (`invoice_dev` locally). |
| `TEST_DATABASE_URL` | Integration tests only. The name must contain "test"; never point it at `invoice_dev`. |
| `E2E_DATABASE_URL` | Playwright only (`invoice_e2e`), so `npm run test` and `npm run e2e` use separate databases. |
| `BETTER_AUTH_SECRET` | Auth secret. Generate with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | Public base URL of the app. |

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Run, build and serve the app. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | `next typegen` + `tsc --noEmit`. |
| `npm run test:unit` | Vitest unit tests (no database). |
| `npm run test:int` | Vitest integration tests against `TEST_DATABASE_URL` (migrates it first). |
| `npm run test` | Both of the above. |
| `npm run e2e` | Playwright against a production build on port 3100 and `E2E_DATABASE_URL` (migrates, builds and starts the server itself). |
| `npm run db:generate` / `db:migrate` | Generate a Drizzle migration from `src/db/schema` / apply migrations. |

### Running e2e

Playwright needs a Chromium binary. Point it at an installed one with `CHROMIUM_PATH`:

```bash
CHROMIUM_PATH=/path/to/chrome npm run e2e
```

If a stray `next-server` is still holding port 3100 from an earlier run, stop it first.

## Conventions

- Every query takes a `userId` and filters by it; another user's id is a `NotFoundError` (404).
- UI copy lives only in `src/messages/{id,en}.json`, with identical keys in both files.
- Feature code is under `src/features/<name>/` (`schema.ts`, `queries.ts`, `actions.ts`, components).
- Client navigations into the signed-in app from outside it (login, register, 404) must be full
  page loads (`window.location` or a plain `<a>`), not `router.push` / `<Link>`.
