# Deploying Invoice Maker

Production runs on Vercel (functions in `sin1`, Singapore) with a Neon Postgres database in
`aws-ap-southeast-1`. This page records how it is set up and how to repeat it. It never contains
secret values: generate them as shown and paste them straight into Vercel.

| | |
| --- | --- |
| Vercel project | `invoice-maker` (team `donnyridwans-projects`) |
| Production URL | https://invoice-maker-beta-two.vercel.app |
| Production branch | `main` |
| Database | Neon, region `aws-ap-southeast-1` |
| Function region | `sin1` (`vercel.json`) |

## 1. Database (Neon)

1. Create a Neon project in **AWS Asia Pacific (Singapore) `aws-ap-southeast-1`**, Postgres 16 or newer.
2. From the connection details copy two strings (both with `?sslmode=require`):
   - **pooled** (host contains `-pooler`): `DATABASE_URL`, used by the running app;
   - **direct** (no `-pooler`): `DATABASE_URL_UNPOOLED`, used by `drizzle-kit` for migrations
     (`drizzle.config.ts` prefers it over `DATABASE_URL`; DDL and advisory locks do not belong on a pooler).

## 2. Vercel project and environment

1. Import the Git repository as a Vercel project named `invoice-maker`; production branch `main`.
2. Keep the framework preset (Next.js). The build runs the package script `vercel-build`:
   `drizzle-kit migrate && next build`, so **every deployment applies pending migrations before building**.
   Migrations are additive; never edit a migration that has already been deployed.
3. `vercel.json` already sets the function region (`sin1`), the two crons and the PDF routes' limits
   (30 s, 1024 MB). Crons run on the **production** deployment only.
4. Add the environment variables (Production; add Preview too if previews should work):

| Variable | Value / how to get it |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection string. |
| `DATABASE_URL_UNPOOLED` | Neon **direct** connection string (migrations). |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | The primary production origin, `https://invoice.donnyridwan.my.id` (no trailing slash). Sign-in also works on `https://invoice-maker-beta-two.vercel.app`: both are in `trustedOrigins` in `src/lib/auth.ts` (add any further domain there). |
| `APP_URL` | Same origin. Used for every link that leaves the app (share links, emails) and as the origin the PDF renderer opens. |
| `PRINT_SECRET` | `openssl rand -base64 32`. Signs the URL that headless Chromium opens to render a PDF. |
| `CRON_SECRET` | `openssl rand -base64 32`. Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>`; the cron routes answer 401 without it. |
| `BLOB_READ_WRITE_TOKEN` | Create a Vercel Blob store and connect it to the project (logos and payment proofs). |
| `RESEND_API_KEY` | Resend API key (see section 3). Optional until email is wanted. |
| `EMAIL_FROM_DOMAIN` | The domain verified in Resend, e.g. `mail.example.com`. Mail is sent as `"<Business name>" <invoice@EMAIL_FROM_DOMAIN>`. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Only when Deployment Protection is on: the project's "Protection Bypass for Automation" secret, so the PDF renderer can open its own print page. |
| `CHROMIUM_PACK_URL` | Optional. Where the PDF renderer downloads its compressed Chromium on a cold start (default: the `chromium-v153.0.0-pack.x64.tar` release of Sparticuz/chromium on GitHub). Set it to serve the same file from your own storage; the version must match `@sparticuz/chromium-min`. |

Do **not** set these in production: `EMAIL_TRANSPORT` and `ALLOW_FILE_EMAIL_TRANSPORT` (local/e2e only; the
file transport is refused in production anyway), `AUTH_RATE_LIMIT_DISABLED` (it switches the sign-in
limiter off), `CHROMIUM_PATH` (Vercel uses `@sparticuz/chromium-min`, which downloads Chromium at runtime).

Without `RESEND_API_KEY` and `EMAIL_FROM_DOMAIN` the app runs normally but hides every email feature
(send by email, email verification, owner notifications, automatic recurring emails). Recurring
schedules then create drafts only.

## 3. Email (Resend), optional

1. Create a Resend account and add your sending domain under **Domains**.
2. Add the DNS records Resend shows (SPF, DKIM, and optionally DMARC) at your DNS provider and wait until the domain is **Verified**.
3. Create an API key with sending access and set `RESEND_API_KEY` and `EMAIL_FROM_DOMAIN` in Vercel, then redeploy.
4. Sign in, open Settings, request the verification email and confirm it arrives. Sending invoices by email requires a verified account email.

## 4. Migrations

Normally nothing to do: `vercel-build` migrates on every deployment. To run them by hand (for example
to prepare the database before the first deploy), use the **direct** connection:

```bash
DATABASE_URL_UNPOOLED='<neon direct connection string>' npm run db:migrate
```

`drizzle-kit` reads `DATABASE_URL_UNPOOLED` first and falls back to `DATABASE_URL`. Check the production
secrets are not left in your shell history or in `.env.local` afterwards.

## 5. Exchange rates

The daily cron `/api/cron/fx` (00:00 WIB, 17:00 UTC) fetches the ECB rates through Frankfurter. Seed the table
once so the dashboard can convert before the first cron run:

```bash
DATABASE_URL='<neon connection string>' npm run fx:fetch
```

(Or trigger the cron route once, see below.) The recurring-invoice cron `/api/cron/recurring` runs at 00:00 UTC (07:00 WIB).

## 6. After the first deployment: checklist

- [ ] The deployment's build log shows `migrations applied successfully` and the build passed.
- [ ] Open the production URL: the sign-in page loads in Bahasa Indonesia.
- [ ] Register a test account, finish onboarding, and land on the dashboard.
- [ ] Create a client, a payment account and an invoice; the editor autosaves.
- [ ] "Download PDF" returns a PDF (this exercises Chromium, `PRINT_SECRET` and `APP_URL`).
- [ ] Copy the share link, open it in a private window: the public page shows the invoice; "Saya sudah bayar" works with a proof upload (Blob).
- [ ] Crons: in the project's **Settings > Cron Jobs** both jobs are listed. Run them once by hand:
  ```bash
  curl -s -H "Authorization: Bearer $CRON_SECRET" https://invoice-maker-beta-two.vercel.app/api/cron/fx
  curl -s -H "Authorization: Bearer $CRON_SECRET" https://invoice-maker-beta-two.vercel.app/api/cron/recurring
  ```
  The first answers `{"date":"…","saved":N}`, the second with `{"processed":0,"created":0,"failed":0,"skipped":0}`.
  Without the header both answer `401`.
- [ ] With email configured: send an invoice to yourself; the PDF is attached and the link opens the public page.
- [ ] Make an invoice recurring (start today), run the recurring cron, and see the draft and the dashboard banner.

## 7. Operations

- **Logs**: Vercel > project > Logs. Unexpected server-action errors are logged as
  `[action] unexpected error { userId, entity, id }` followed by the error; the input is never logged.
- **Recurring runs** stop starting new work after 45 s; what is left is reported as `skipped` and picked up by
  the next run. A schedule that fails seven runs in a row is stopped and shows the reason.
- **Rollback**: promote the previous deployment from the Vercel dashboard. Migrations are additive, so the old code keeps working against the newer schema.
- **Secrets rotation**: changing `BETTER_AUTH_SECRET` signs everyone out; changing `PRINT_SECRET` or `CRON_SECRET` only needs a redeploy.
