# Plan 1 — Fondasi & Data Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikasi web Next.js yang bisa dijalankan dengan:
- daftar/login,
- UI dwibahasa,
- shell bergaya Stripe,
- onboarding profil bisnis,
- CRUD rekening pembayaran, klien, dan katalog jasa.

Ini fase 1–2 dari spec. Editor invoice ada di Plan 2.

**Architecture:** Satu aplikasi Next.js 16 (App Router).
- Kode dikelompokkan per domain di `src/features/<domain>/`:
  - `schema.ts` (zod),
  - `queries.ts` (akses DB murni, selalu menerima `userId`),
  - `actions.ts` (server action tipis: `requireUser` → queries → `revalidatePath`),
  - komponen UI.
- Drizzle + driver `postgres` ke Postgres 16 lokal (dev/test) atau Neon
  (produksi).
- Better Auth untuk sesi.
- next-intl tanpa prefix URL (locale di cookie).

**Tech Stack:**
- Next.js 16.4, React 19, TypeScript strict
- Tailwind CSS 4, komponen gaya shadcn/ui
- Drizzle ORM 0.45 + drizzle-kit 0.31 + postgres 3.4
- Better Auth 1.7, next-intl 4.14, zod 4
- Vitest 5, Playwright 1.64

**Spec:** `docs/superpowers/specs/2026-10-21-invoice-maker-mvp-design.md`

## Global Constraints

**Runtime & dependensi**
- Node 22. Package manager **npm**. TypeScript `strict: true`. Alias import
  `@/*` → `src/*`.
- Satu driver DB (`postgres`) untuk lokal & Neon. `DATABASE_URL` untuk app,
  `TEST_DATABASE_URL` untuk test.
- Konfigurasi lokal:
  - Postgres 16 di `localhost:5432`, user `postgres` / password `postgres`.
  - DB `invoice_dev` dan `invoice_test`.
  - Chromium Playwright ada di `/opt/pw-browsers`. Jangan jalankan
    `playwright install`.

**Data & keamanan**
- Uang disimpan sebagai integer minor unit (`bigint` mode `number`). IDR dan
  JPY punya 0 desimal; mata uang lain 2.
- Setiap query data milik pengguna memfilter `userId`. ID milik orang lain
  diperlakukan sama dengan tidak ada: `NotFoundError` → halaman 404.
- Panjang maksimal input teks: nama 200, alamat/catatan 2000, satuan 30.

**UI & bahasa**
- Locale UI `id` (default) dan `en`, disimpan di cookie `NEXT_LOCALE`. Nilai
  lain jatuh ke `id`. Semua teks UI berasal dari `src/messages/{id,en}.json`.
- Zona waktu tampilan `Asia/Jakarta`.
- Gaya visual (spec §2a):
  - Font Inter, teks 14px.
  - Aksen `#5850EC`, border `#E3E8EE`, teks `#1A1F36` dan sekunder `#697386`.
  - Radius 6px, sidebar putih dengan border kanan.
  - Badge status pastel, empty state dengan border putus-putus.

## Review Focus

1. **Input uang berformat lokal.** "1.500.000" (id) dan "1,500,000" (en) untuk
   IDR harus jadi 1500000, bukan 1500. "12,5" (id, USD) harus jadi 1250. Teks
   tak valid ditolak. → Task 3.
2. **Menebak ID milik pengguna lain** lewat URL atau server action harus
   menghasilkan 404, tidak membocorkan atau mengubah data. → test ownership
   di Task 7, 9, 10.
3. **Email dengan huruf besar/spasi saat daftar & login** ("Donny@Mail.com ")
   tetap dikenali sebagai akun yang sama. → Task 5.
4. **Data yang diarsipkan** (klien, katalog, rekening) hilang dari daftar
   default dan pilihan, tapi tetap muncul di filter "Arsip" dan bisa
   dipulihkan. → Task 7, 9, 10.
5. **Cookie locale tidak valid** (`NEXT_LOCALE=fr`) tetap menampilkan bahasa
   Indonesia tanpa error. → Task 2.

---

## File Structure

```
package.json, tsconfig.json, next.config.ts, postcss.config.mjs, eslint.config.mjs
drizzle.config.ts, vitest.config.ts, playwright.config.ts, .env.example
scripts/setup-local-db.sh
drizzle/                                   migrasi hasil drizzle-kit
src/app/globals.css                        token desain (Tailwind v4 @theme)
src/app/layout.tsx                         font Inter, NextIntlClientProvider, Toaster
src/app/not-found.tsx
src/app/(auth)/layout.tsx, login/page.tsx, register/page.tsx
src/app/(app)/layout.tsx                   requireUser + redirect onboarding + AppShell
src/app/(app)/dashboard/page.tsx
src/app/(app)/onboarding/page.tsx
src/app/(app)/settings/page.tsx            profil + default invoice + akun
src/app/(app)/settings/payment-accounts/page.tsx
src/app/(app)/clients/page.tsx, clients/new/page.tsx, clients/[id]/page.tsx
src/app/(app)/catalog/page.tsx
src/app/api/auth/[...all]/route.ts
src/proxy.ts                               redirect optimistis berbasis cookie sesi
src/components/ui/*                        button, input, label, textarea, select, badge,
                                           card, dialog, table, dropdown-menu, empty-state, page-header
src/components/app-shell/{app-shell,sidebar,user-menu,locale-switcher}.tsx
src/i18n/{config.ts,request.ts,actions.ts}
src/messages/{id,en}.json
src/db/{client.ts,schema/auth.ts,schema/app.ts,schema/index.ts}
src/lib/{auth.ts,auth-client.ts,session.ts,errors.ts,action-result.ts,money.ts,currencies.ts,utils.ts}
src/features/profile/{schema.ts,queries.ts,actions.ts,profile-form.tsx,onboarding-form.tsx,checklist.tsx}
src/features/payment-accounts/{schema.ts,queries.ts,actions.ts,summary.ts,payment-account-form.tsx,payment-account-list.tsx}
src/features/clients/{schema.ts,queries.ts,actions.ts,client-form.tsx,client-table.tsx}
src/features/catalog/{schema.ts,queries.ts,actions.ts,catalog-form.tsx,catalog-table.tsx}
tests/unit/*.test.ts
tests/integration/{global-setup.ts,helpers.ts,*.test.ts}
e2e/{helpers.ts,foundation.spec.ts}
```

---

### Task 1: Scaffold aplikasi + sistem desain

**Files:**
- Create: semua file konfigurasi root, `src/app/{layout.tsx,globals.css,not-found.tsx}`,
  `src/app/page.tsx` (redirect ke `/dashboard`), `src/components/ui/*`,
  `src/lib/utils.ts`, `vitest.config.ts`, `tests/unit/utils.test.ts`,
  `.gitignore`, `.env.example`
- Test: `tests/unit/utils.test.ts`

**Interfaces:**
- Produces:
  - `cn(...inputs: ClassValue[]): string` di `src/lib/utils.ts`.
  - Komponen UI: `Button` (varian `primary|secondary|ghost|destructive`, ukuran
    `sm|md`), `Input`, `Label`, `Textarea`, `Select`, `Badge`, `Card`, `Dialog`,
    `Table`, `DropdownMenu`.
  - Komponen tata letak: `EmptyState({title, description, action})` dan
    `PageHeader({title, description?, actions?})`.
  - Badge memakai varian `neutral|info|success|warning|danger`.
  - Script npm: `dev`, `build`, `start`, `lint`, `typecheck`, `test`
    (`vitest run`), `test:unit`, `test:int`, `e2e`, `db:generate`, `db:migrate`.

- [ ] **Step 1: Scaffold.** Jalankan `npx create-next-app@16.4.2 . --ts
  --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack=false`
  di direktori repo (pindahkan `docs/` sementara jika CLI menolak direktori
  tidak kosong). Tambah dependensi `clsx tailwind-merge class-variance-authority
  lucide-react sonner @radix-ui/react-{dialog,dropdown-menu,select,label,slot}`
  dan dev dependency `vitest`.
- [ ] **Step 2: Komponen UI.** Coba `npx shadcn@latest init` lalu `add`
  komponen di atas. Bila registry tidak terjangkau, tulis komponen yang setara
  secara manual di `src/components/ui/`.
- [ ] **Step 3: Token desain.** Tulis token di `globals.css` dengan
  `@theme`:
  - Warna: `--color-accent: #5850EC`, `--color-border: #E3E8EE`,
    `--color-fg: #1A1F36`, `--color-muted: #697386`,
    `--color-subtle: #F6F8FA`, `--radius: 6px`.
  - Pasangan badge (latar/teks):
    - success `#D7F7C2` / `#05690D`
    - info `#CFF5F6` / `#0055BC`
    - warning `#FCEDB9` / `#A82C00`
    - danger `#FFE7F2` / `#B3093C`
    - neutral `#EBEEF1` / `#545969`
  - Body: `text-sm text-fg bg-white antialiased`, font Inter via
    `next/font/google`.
- [ ] **Step 4: Tulis test gagal** `tests/unit/utils.test.ts`:
  `expect(cn('px-2', false && 'hidden', 'px-4')).toBe('px-4')`.
  Run `npm run test:unit` → FAIL bila `cn` belum ada.
- [ ] **Step 5: Implementasi `cn`** (clsx + tailwind-merge). Konfigurasi
  `vitest.config.ts` dengan dua `projects`:
  - `unit`: `tests/unit/**`, environment node.
  - `integration`: `tests/integration/**`, `fileParallelism: false`,
    `globalSetup: tests/integration/global-setup.ts` (dibuat di Task 3).
  - Tambahkan alias `@`.
- [ ] **Step 6: Verifikasi.** `npm run test:unit` PASS, `npm run typecheck` dan
  `npm run build` sukses.
- [ ] **Step 7: Commit** `chore: scaffold Next.js app with Stripe-like design system`

### Task 2: i18n (UI dwibahasa)

**Files:**
- Create: `src/i18n/config.ts`, `src/i18n/request.ts`, `src/i18n/actions.ts`,
  `src/messages/id.json`, `src/messages/en.json`,
  `src/components/app-shell/locale-switcher.tsx`
- Modify: `next.config.ts` (plugin `next-intl`), `src/app/layout.tsx`
- Test: `tests/unit/i18n.test.ts`

**Interfaces:**
- Produces:
  - Di `config.ts`: `type Locale = 'id' | 'en'`, `LOCALES: Locale[]`,
    `DEFAULT_LOCALE: 'id'`, `LOCALE_COOKIE = 'NEXT_LOCALE'`,
    `resolveLocale(value: string | undefined | null): Locale`.
  - Server action `setLocale(locale: Locale): Promise<void>` di `actions.ts`.
    Aksi ini menulis cookie (1 tahun). Task 8 menambahkan update
    `business_profiles.ui_locale`.
  - Namespace pesan: `common`, `nav`, `auth`, `onboarding`, `dashboard`,
    `settings`, `paymentAccounts`, `clients`, `catalog`, `validation`.
  - `LocaleSwitcher` adalah client component berupa dropdown "Bahasa
    Indonesia / English".

- [ ] **Step 1: Tulis test gagal** `tests/unit/i18n.test.ts`:
  - `resolveLocale('en') === 'en'`
  - `resolveLocale('fr') === 'id'`
  - `resolveLocale(undefined) === 'id'`
  - Test paritas: himpunan key bersarang (di-flatten) di `id.json` sama dengan
    di `en.json`.
- [ ] **Step 2:** Run `npm run test:unit -- i18n` → FAIL.
- [ ] **Step 3: Implementasi.**
  - `request.ts` membaca cookie via `cookies()` lalu `resolveLocale`, dan
    memuat `messages/${locale}.json`.
  - Layout membungkus aplikasi dengan `NextIntlClientProvider` dan
    `<html lang={locale}>`.
- [ ] **Step 4:** Run `npm run test:unit` → PASS. Pastikan `npm run build`
  sukses.
- [ ] **Step 5: Commit** `feat: add bilingual UI (id/en) with cookie locale`

### Task 3: Database, skema, dan harness test integrasi

**Files:**
- Create: `scripts/setup-local-db.sh`, `drizzle.config.ts`, `src/db/client.ts`,
  `src/db/schema/{auth.ts,app.ts,index.ts}`, `drizzle/*` (generated),
  `tests/integration/{global-setup.ts,helpers.ts,schema.test.ts}`,
  `src/lib/errors.ts`
- Test: `tests/integration/schema.test.ts`

**Interfaces:**
- Produces:
  - `db` di `src/db/client.ts`: drizzle instance dari `postgres(DATABASE_URL)`,
    singleton via `globalThis` agar aman saat HMR.
  - Tabel auth: `user`, `session`, `account`, `verification`. Kolom mengikuti
    skema inti Better Auth 1.7. Generate dengan
    `npx @better-auth/cli generate`; bila gagal, tulis manual.
  - Tabel app (snake_case di DB, camelCase di TS; `id` uuid `defaultRandom()`;
    `createdAt`/`updatedAt` timestamptz):
    - `businessProfiles`:
      - `userId` (pk & fk → user, cascade), `businessName`, `email`,
        `phone`, `address`, `taxId`, `logoUrl`
      - `accentColor` default `'#5850EC'`, `defaultTemplate` default
        `'minimal'`
      - `baseCurrency` default `'IDR'`, `defaultCurrency` default `'IDR'`,
        `defaultLanguage` default `'id'`, `defaultDueDays` default 14
      - `invoicePrefix` default `'INV-'`, `nextInvoiceNumber` default 1
      - `defaultNotes`, `uiLocale` default `'id'`, `onboardingCompletedAt`
    - `paymentAccounts`: `id`, `userId`, `type` (pgEnum
      `payment_account_type`: bank|paypal|wise|swift|other), `label`,
      `details` jsonb, `currency`, `isDefault` bool, `archivedAt`.
    - `clients`: `id`, `userId`, `name`, `company`, `email`, `phone`,
      `address`, `country`, `defaultCurrency`, `defaultLanguage`, `notes`,
      `archivedAt`. Index `(userId, name)`.
    - `catalogItems`: `id`, `userId`, `name`, `description`, `unit`,
      `unitPriceMinor` bigint, `currency`, `archivedAt`.
  - Di `errors.ts`: `class NotFoundError extends Error` dan
    `class ValidationError extends Error { fieldErrors: Record<string,string[]> }`.
  - Helper test di `helpers.ts`:
    - `testDb`
    - `resetDb(): Promise<void>` (TRUNCATE semua tabel CASCADE)
    - `createTestUser(overrides?): Promise<{ id: string; email: string }>`
      (insert langsung ke `user`).

- [ ] **Step 1: Setup DB lokal.** Tulis `scripts/setup-local-db.sh`
  (idempoten):
  - `pg_ctlcluster 16 main start`.
  - Set password `postgres`.
  - `createdb invoice_dev` dan `invoice_test` bila belum ada.
  Jalankan, lalu isi `.env.local`/`.env.example` dengan `DATABASE_URL` dan
  `TEST_DATABASE_URL`.
- [ ] **Step 2: Tulis test gagal** `tests/integration/schema.test.ts`:
  - Setelah `createTestUser()`, insert `clients` dengan `{ userId, name: 'Budi' }`.
  - Select-nya mengembalikan 1 baris dengan `archivedAt === null` dan `id` uuid.
  - Menghapus user ikut menghapus kliennya (cascade).
- [ ] **Step 3:** Run `npm run test:int` → FAIL (tabel belum ada).
- [ ] **Step 4: Tulis skema** lalu `npm run db:generate`.
  `global-setup.ts` menjalankan `migrate()` ke `TEST_DATABASE_URL`, dan setiap
  file test memanggil `resetDb()` di `beforeEach`.
- [ ] **Step 5:** Run `npm run test:int` → PASS. Jalankan juga `npm run
  db:migrate` ke `invoice_dev`.
- [ ] **Step 6: Commit** `feat: add database schema, migrations and integration test harness`

### Task 4: Uang & mata uang

**Files:**
- Create: `src/lib/currencies.ts`, `src/lib/money.ts`
- Test: `tests/unit/money.test.ts`

**Interfaces:**
- Produces:
  - Di `currencies.ts`:
    - `CURRENCY_CODES` = `['IDR','USD','SGD','EUR','AUD','GBP','MYR','JPY','CAD','CHF','HKD','NZD','CNY','THB']`
      (as const).
    - `type CurrencyCode`.
    - `currencyDecimals(code): 0 | 2` (IDR, JPY = 0).
    - `isCurrencyCode(v: string): v is CurrencyCode`.
  - Di `money.ts`:
    - `parseMoneyInput(input: string, currency: CurrencyCode, locale: Locale): number | null`
      mengembalikan minor unit.
    - `formatMoney(minor: number, currency: CurrencyCode, locale: Locale): string`
      memakai Intl `id-ID`/`en-US` dengan jumlah desimal mata uang.
    - `formatMoneyInput(minor, currency, locale): string` (tanpa simbol, untuk
      mengisi ulang input).

- [ ] **Step 1: Tulis test gagal** `tests/unit/money.test.ts`. Normalisasi
  ` ` → spasi sebelum membandingkan.
  - `parseMoneyInput('1.500.000','IDR','id') === 1500000`
  - `parseMoneyInput('1,500,000','IDR','en') === 1500000`
  - `parseMoneyInput('1500000','IDR','id') === 1500000`
  - `parseMoneyInput('12,5','USD','id') === 1250`
  - `parseMoneyInput('12.5','USD','en') === 1250`
  - `parseMoneyInput('0,005','USD','id') === 1` (round half up)
  - `parseMoneyInput('Rp 2.000','IDR','id') === 2000` (simbol & spasi diabaikan)
  - `parseMoneyInput('abc','IDR','id') === null`
  - `parseMoneyInput('-5','IDR','id') === null`
  - `parseMoneyInput('','IDR','id') === null`
  - `formatMoney(5000000,'IDR','id') === 'Rp 5.000.000'`
  - `formatMoney(5000000,'IDR','en') === 'IDR 5,000,000'`
  - `formatMoney(125000,'USD','en') === '$1,250.00'`
  - `formatMoney(125000,'USD','id') === 'US$1.250,00'`
  - `formatMoney(1000,'JPY','id') === 'JP¥1.000'`
  - `formatMoneyInput(125000,'USD','id') === '1.250,00'`
- [ ] **Step 2:** Run `npm run test:unit -- money` → FAIL.
- [ ] **Step 3: Implementasi.** Algoritma parse:
  1. Buang semua karakter selain digit, `.`, `,`, dan `-`. Tanda `-` membuat
     hasil `null`.
  2. Pemisah ribuan = `.` untuk `id` dan `,` untuk `en`; pemisah desimal
     sebaliknya.
  3. Hapus pemisah ribuan, ganti pemisah desimal dengan `.`.
  4. Validasi `/^\d+(\.\d+)?$/`.
  5. Kalikan dengan `10^decimals` memakai aritmetika string, lalu round half up
     pada digit berikutnya.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat: add currency list and locale-aware money parsing/formatting`

### Task 5: Autentikasi (email + password, tanpa verifikasi)

**Files:**
- Create: `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/lib/session.ts`,
  `src/app/api/auth/[...all]/route.ts`, `src/proxy.ts`,
  `src/app/(auth)/{layout.tsx,login/page.tsx,register/page.tsx}`,
  `src/features/auth/{login-form.tsx,register-form.tsx}`,
  `playwright.config.ts`, `e2e/helpers.ts`, `e2e/foundation.spec.ts`
- Test: `e2e/foundation.spec.ts` (bagian auth)

**Interfaces:**
- Consumes: `db`, tabel auth (Task 3).
- Produces:
  - `auth` di `src/lib/auth.ts`, dikonfigurasi dengan:
    - `betterAuth({ database: drizzleAdapter(db, { provider: 'pg', schema }), emailAndPassword: { enabled: true, requireEmailVerification: false, minPasswordLength: 8 }, plugins: [nextCookies()] })`.
    - Hook `databaseHooks.user.create.after` memanggil
      `ensureProfile(user.id, { businessName: user.name, email: user.email })`
      dari Task 8. Sampai Task 8, hook dibiarkan kosong.
  - `authClient` di `auth-client.ts`: `createAuthClient()`.
  - Di `session.ts`:
    - `getOptionalUser(): Promise<SessionUser | null>`
    - `requireUser(): Promise<SessionUser>`, yang memanggil
      `redirect('/login')` bila tidak ada sesi.
    - `type SessionUser = { id: string; email: string; name: string; emailVerified: boolean }`.
  - Proxy: rute `/dashboard`, `/onboarding`, `/settings`, `/clients`, dan
    `/catalog` tanpa cookie sesi (`getSessionCookie`) → `/login?next=…`.
    `/login` dan `/register` dengan cookie → `/dashboard`.
  - Helper e2e di `e2e/helpers.ts`:
    `registerUser(page, { name?, email?, password? }): Promise<{ email, password }>`
    memakai email unik `e2e+<timestamp>@example.com`.

- [ ] **Step 1: Konfigurasi Playwright.**
  - `webServer`: `npm run build && npm run start -- -p 3100`, dengan
    `DATABASE_URL=TEST_DATABASE_URL` dan migrasi dijalankan sebelumnya.
  - `use.launchOptions.executablePath` dari env `CHROMIUM_PATH` bila diset.
  - `baseURL: http://localhost:3100`.
- [ ] **Step 2: Tulis test e2e gagal** di `e2e/foundation.spec.ts` (`describe('auth')`):
  - Buka `/dashboard` tanpa login → URL berakhir `/login?next=%2Fdashboard`.
  - Daftar dengan nama "Donny", email unik, password `rahasia123` → mendarat
    di `/onboarding` (Task 8). Untuk sekarang, assert URL bukan `/register`
    dan cookie sesi ada.
  - Logout lalu login dengan email yang sama ditulis `'  ' + EMAIL.toUpperCase() + ' '`
    → berhasil masuk.
  - Login dengan password salah → tampil pesan `auth.invalidCredentials`
    ("Email atau password salah").
  - Daftar dengan password `1234567` → tampil `validation.passwordMin`
    ("Password minimal 8 karakter").
- [ ] **Step 3:** Run `npm run e2e -- -g auth` → FAIL.
- [ ] **Step 4: Implementasi.**
  - Form login/daftar sebagai client component memanggil
    `authClient.signIn.email` / `signUp.email`. Email di-`trim().toLowerCase()`
    sebelum dikirim.
  - Tampilan: kartu terpusat 400px di atas `bg-subtle`, logo teks "Invoice
    Maker", gaya Stripe.
- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6: Commit** `feat: add email/password auth with route protection`

### Task 6: App shell & dashboard

**Files:**
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/dashboard/page.tsx`,
  `src/components/app-shell/{app-shell.tsx,sidebar.tsx,user-menu.tsx}`
- Modify: `e2e/foundation.spec.ts`
- Test: `e2e/foundation.spec.ts` (`describe('shell')`)

**Interfaces:**
- Consumes: `requireUser` (Task 5), `LocaleSwitcher` (Task 2).
- Produces:
  - `AppShell({ user, children })`. Item navigasi didefinisikan sebagai
    `NAV_ITEMS: { href: string; labelKey: string; icon: LucideIcon }[]` di
    `sidebar.tsx`: dashboard, clients, catalog, settings. Plan 2 menambahkan
    invoices.
  - Tampilan desktop:
    - Sidebar 240px putih dengan border kanan. Item aktif: teks aksen dan
      latar `subtle`.
    - Area konten `max-w-6xl` dengan padding 32px.
  - Mobile: sidebar menjadi drawer lewat tombol menu.
  - `UserMenu` menampilkan nama/email, pilihan bahasa, dan "Keluar".

- [ ] **Step 1: Tulis test e2e gagal** `describe('shell')`:
  - Setelah daftar, buka `/dashboard`.
  - Heading berisi "Halo, Donny".
  - Sidebar punya link "Klien", "Katalog", "Pengaturan".
  - Klik "Keluar" → kembali ke `/login`.
  - Ganti bahasa ke English lewat user menu → link sidebar menjadi "Clients".
  - Set cookie `NEXT_LOCALE=fr` lalu reload → link tetap "Klien".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implementasi** shell dan dashboard. Dashboard berisi heading
  sapaan dan slot checklist (diisi Task 8).
- [ ] **Step 4:** Run → PASS. Cek `npm run build`.
- [ ] **Step 5: Commit** `feat: add Stripe-like app shell and dashboard`

### Task 7: Rekening pembayaran

**Files:**
- Create: `src/features/payment-accounts/{schema.ts,queries.ts,actions.ts,summary.ts,payment-account-form.tsx,payment-account-list.tsx}`,
  `src/app/(app)/settings/payment-accounts/page.tsx`, `src/lib/action-result.ts`
- Test: `tests/unit/payment-account-summary.test.ts`, `tests/integration/payment-accounts.test.ts`

**Interfaces:**
- Produces:
  - Di `action-result.ts`:
    - `type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }`
    - `toActionError(e: unknown): ActionResult<never>`, yang memetakan
      `ValidationError`, `ZodError`, dan `NotFoundError`.
  - `paymentAccountSchema`: zod `discriminatedUnion('type')`.
    - Field bersama: `label?` (≤100), `currency?` (`CurrencyCode`),
      `isDefault` (bool).
    - Field per tipe:
      - `bank`: `bankName`, `accountName`, `accountNumber` (wajib).
      - `paypal`: `email` (wajib, valid).
      - `wise`: `accountName` (wajib), plus opsional `email`, `accountNumber`,
        dan `iban`.
      - `swift`: `bankName`, `accountName`, `swift` (wajib, 8–11 alfanumerik),
        dan salah satu dari `accountNumber`/`iban`.
      - `other`: `instructions` (wajib, ≤2000).
  - `type PaymentAccount = { id; userId; type; label; details; currency; isDefault; archivedAt; createdAt }`.
  - Queries:
    - `listPaymentAccounts(userId, { includeArchived?: boolean })`, diurutkan
      default dulu lalu `createdAt`.
    - `getPaymentAccount(userId, id)`.
    - `createPaymentAccount(userId, input)`.
    - `updatePaymentAccount(userId, id, input)`.
    - `archivePaymentAccount(userId, id)`.
    - `restorePaymentAccount(userId, id)`.
    - Semua query melempar `NotFoundError` untuk ID milik orang lain.
  - `summarizePaymentAccount(a): { title: string; subtitle: string }` di
    `summary.ts`.

- [ ] **Step 1: Tulis test unit gagal** `tests/unit/payment-account-summary.test.ts`
  untuk `summarizePaymentAccount`:
  - bank BCA / Donny / 1234567890 → `{ title: 'BCA', subtitle: 'Donny · •••• 7890' }`.
  - paypal `pay@donny.com` → `{ title: 'PayPal', subtitle: 'pay@donny.com' }`.
  - `label: 'Rekening USD'` mengalahkan title default.
- [ ] **Step 2: Tulis test integrasi gagal**
  `tests/integration/payment-accounts.test.ts`:
  - Membuat rekening bank kedua dengan `isDefault: true` membuat rekening
    default sebelumnya menjadi `false` (hanya satu default per user).
  - Input `swift` tanpa `accountNumber` dan `iban` ditolak.
  - Rekening yang diarsipkan tidak muncul di `listPaymentAccounts(u)`, tapi
    muncul dengan `includeArchived: true`. `restorePaymentAccount`
    mengembalikannya.
  - `updatePaymentAccount(userB, idMilikA, …)` dan
    `archivePaymentAccount(userB, idMilikA)` melempar `NotFoundError`, dan
    data A tidak berubah.
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4: Implementasi.**
  - Halaman `/settings/payment-accounts` menampilkan daftar kartu. Setiap kartu
    berisi ikon tipe, ringkasan, badge "Default", dan menu ⋯ (Edit, Jadikan
    default, Arsipkan).
  - Tombol "+ Tambah rekening" membuka dialog dengan pilihan tipe di atas;
    field form menyesuaikan tipe.
  - Toggle "Tampilkan arsip". Empty state memakai border putus-putus.
  - Produces juga `hasActivePaymentAccount(userId): Promise<boolean>` (dipakai
    `getChecklist` di Task 8).
- [ ] **Step 5:** Run unit + integrasi → PASS.
- [ ] **Step 6: Commit** `feat: add payment accounts management`

### Task 8: Profil bisnis, onboarding, pengaturan

**Files:**
- Create: `src/features/profile/{schema.ts,queries.ts,actions.ts,onboarding-form.tsx,profile-form.tsx,checklist.tsx}`,
  `src/app/(app)/onboarding/page.tsx`, `src/app/(app)/settings/page.tsx`
- Modify: `src/lib/auth.ts` (hook `ensureProfile`), `src/app/(app)/layout.tsx`
  (redirect onboarding), `src/i18n/actions.ts` (simpan `uiLocale`)
- Test: `tests/integration/profile.test.ts`, `e2e/foundation.spec.ts` (`describe('onboarding')`)

**Interfaces:**
- Consumes: `db`, `businessProfiles`, `CurrencyCode`, `Locale`.
- Produces:
  - Consumes `ActionResult`/`toActionError` (Task 7).
  - Di `schema.ts`:
    - `profileSchema` (zod) untuk `businessName` (1–200), `email` (opsional,
      valid), `phone`, `address` (≤2000), `taxId`, `baseCurrency`, dan
      `defaultCurrency` (`CurrencyCode`).
    - `invoiceDefaultsSchema` untuk:
      - `invoicePrefix` (0–20, regex `^[A-Za-z0-9/._-]*$`)
      - `defaultDueDays` (0–365)
      - `defaultLanguage`
      - `defaultNotes`
      - `defaultTemplate` (`'minimal'|'classic'|'modern'`)
      - `accentColor` (`^#[0-9A-Fa-f]{6}$`)
    - `type ProfileInput`, `type InvoiceDefaultsInput`.
  - Di `queries.ts`:
    - `ensureProfile(userId, { businessName, email }): Promise<void>` (insert,
      on conflict do nothing).
    - `getProfile(userId): Promise<BusinessProfile>` (melempar `NotFoundError`).
    - `updateProfile(userId, input: ProfileInput)`.
    - `updateInvoiceDefaults(userId, input: InvoiceDefaultsInput)`.
    - `completeOnboarding(userId)`.
    - `getChecklist(userId): Promise<{ profileComplete: boolean; hasPaymentAccount: boolean }>`.
      `profileComplete` = `businessName` dan `address` terisi.
  - Server actions `saveProfileAction`, `saveInvoiceDefaultsAction`,
    `finishOnboardingAction(formData)` (profil + opsional satu rekening via Task
    8 `createPaymentAccount`), dan `skipOnboardingAction()`.
  - `(app)/layout.tsx`: bila `onboardingCompletedAt` null dan path bukan
    `/onboarding` → `redirect('/onboarding')`. Path dibaca dari header
    `x-pathname` yang di-set di proxy.

- [ ] **Step 1: Tulis test integrasi gagal** `tests/integration/profile.test.ts`:
  - `ensureProfile` dua kali tidak error dan menghasilkan satu baris dengan
    default `invoicePrefix 'INV-'`, `defaultDueDays 14`, `baseCurrency 'IDR'`,
    dan `accentColor '#5850EC'`.
  - `updateProfile` dengan `businessName: ''` melempar error validasi.
  - `getChecklist` awal `{ profileComplete: false, hasPaymentAccount: false }`.
    Setelah update `businessName` + `address`, `profileComplete` bernilai
    `true`.
  - `updateInvoiceDefaults` dengan `accentColor: 'red'` ditolak.
  - `getProfile(userLain)` melempar `NotFoundError`.
- [ ] **Step 2:** Run `npm run test:int -- profile` → FAIL.
- [ ] **Step 3: Implementasi** queries, actions, dan halaman.
  - **Onboarding**: satu kartu dengan isian nama bisnis, mata uang utama, dan
    bagian lipat "Tambah rekening" (bank: nama bank, nama pemilik, nomor).
    Tombol "Lanjut" (primary) dan "Lewati". Keduanya menuju `/dashboard`;
    Plan 2 mengubahnya ke editor invoice.
  - **Settings**: tiga kartu, yaitu Profil bisnis, Default invoice, dan Akun
    (ganti password via `authClient.changePassword`, dengan link ke
    `/settings/payment-accounts`).
  - **Dashboard**: menampilkan `Checklist` bergaya kartu "Get started"
    Stripe, dengan item tercentang/belum dan link ke halaman terkait.
- [ ] **Step 4: Tambah e2e** `describe('onboarding')`:
  - Daftar → URL `/onboarding`.
  - Isi "Studio Donny", klik Lanjut → `/dashboard`. Checklist "Lengkapi profil
    bisnis" belum tercentang karena alamat kosong.
  - Isi alamat di `/settings`, simpan → toast "Tersimpan". Kembali ke dashboard
    → item tercentang.
  - Pengguna baru lain klik "Lewati" → `/dashboard`. Membuka `/onboarding` lagi
    tidak memaksa redirect.
- [ ] **Step 5:** Run `npm run test:int` dan `npm run e2e` → PASS.
- [ ] **Step 6: Commit** `feat: add business profile, onboarding and settings`

### Task 9: Klien

**Files:**
- Create: `src/features/clients/{schema.ts,queries.ts,actions.ts,client-form.tsx,client-table.tsx}`,
  `src/app/(app)/clients/{page.tsx,new/page.tsx,[id]/page.tsx}`
- Test: `tests/integration/clients.test.ts`, `e2e/foundation.spec.ts` (`describe('clients')`)

**Interfaces:**
- Produces:
  - `clientSchema` dengan field:
    - `name` (1–200), `company?` (≤200), `email?` (valid), `phone?` (≤30)
    - `address?` (≤2000), `country?` (ISO-3166 alpha-2)
    - `defaultCurrency` (`CurrencyCode`), `defaultLanguage` (`Locale`)
    - `notes?` (≤2000)
  - `type Client`.
  - Queries:
    - `listClients(userId, { search?: string; includeArchived?: boolean })`:
      `search` dicocokkan ILIKE pada `name`, `company`, dan `email`; urut
      `name`.
    - `getClient(userId, id)`.
    - `createClient(userId, input)`.
    - `updateClient(userId, id, input)`.
    - `archiveClient(userId, id)`.
    - `restoreClient(userId, id)`.
    - ID asing → `NotFoundError`.
  - Form klien baru mengambil default mata uang & bahasa dari profil.

- [ ] **Step 1: Tulis test integrasi gagal** `tests/integration/clients.test.ts`:
  - `createClient` dengan `name: '  PT Maju  '` tersimpan sebagai `'PT Maju'`
    (trim).
  - `email: 'bukan-email'` ditolak.
  - Nama 201 karakter ditolak.
  - `listClients(u, { search: 'maju' })` menemukan "PT Maju" (case-insensitive)
    dan tidak menemukan klien lain.
  - Klien yang diarsipkan hilang dari daftar default, muncul dengan
    `includeArchived`, dan `restoreClient` mengembalikannya.
  - `getClient(userB, idMilikA)` dan `updateClient(userB, idMilikA, …)`
    melempar `NotFoundError`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implementasi** halaman.
  - **Daftar**: `PageHeader` "Klien" dengan tombol "+ Klien baru", input cari
    (query param `q`), tab Aktif/Arsip, dan tabel (Nama + perusahaan, Email,
    Mata uang, Bahasa).
  - **Detail** `/clients/[id]`: form edit dan tombol Arsipkan/Pulihkan. ID
    asing → `notFound()`.
- [ ] **Step 4: Tambah e2e** `describe('clients')`:
  - Buat klien "Acme Inc" dengan email `billing@acme.com`, mata uang USD,
    bahasa English → muncul di tabel dengan "USD".
  - Cari "acme" → 1 baris.
  - Arsipkan → hilang dari tab Aktif, ada di tab Arsip.
- [ ] **Step 5:** Run → PASS.
- [ ] **Step 6: Commit** `feat: add client management`

### Task 10: Katalog jasa

**Files:**
- Create: `src/features/catalog/{schema.ts,queries.ts,actions.ts,catalog-form.tsx,catalog-table.tsx}`,
  `src/app/(app)/catalog/page.tsx`
- Test: `tests/integration/catalog.test.ts`, `e2e/foundation.spec.ts` (`describe('catalog')`)

**Interfaces:**
- Consumes: `parseMoneyInput`, `formatMoney`, `formatMoneyInput` (Task 4).
- Produces:
  - `catalogItemSchema` dengan field `name` (1–200), `description?` (≤2000),
    `unit?` (≤30), `unitPriceMinor` (int ≥ 0), dan `currency`.
  - Di form, harga diketik sebagai string lalu diubah di server action lewat
    `parseMoneyInput` dengan locale UI. Hasil `null` →
    `fieldErrors.unitPrice = ['validation.invalidAmount']`.
  - Queries:
    - `listCatalogItems(userId, { search?, includeArchived? })`.
    - `getCatalogItem(userId, id)`.
    - `createCatalogItem(userId, input)`.
    - `updateCatalogItem(userId, id, input)`.
    - `archiveCatalogItem(userId, id)`.
    - `restoreCatalogItem(userId, id)`.
    - ID asing → `NotFoundError`.
  - Plan 2 memakai `listCatalogItems` untuk autocomplete item invoice.

- [ ] **Step 1: Tulis test integrasi gagal** `tests/integration/catalog.test.ts`:
  - `createCatalogItem` dengan `{ name: 'Desain logo', unit: 'proyek', unitPriceMinor: 1500000, currency: 'IDR' }`
    tersimpan, dan `unitPriceMinor` terbaca kembali sebagai `number` 1500000.
  - `unitPriceMinor: -1` ditolak.
  - `currency: 'XYZ'` ditolak.
  - Arsip/pulihkan berperilaku sama seperti di klien.
  - Akses ID milik user lain → `NotFoundError`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implementasi** halaman `/catalog`.
  - Tabel berisi Nama + deskripsi, Satuan, dan Harga (`formatMoney`, rata
    kanan, `tabular-nums`).
  - Dialog tambah/edit memakai input harga dengan prefix kode mata uang.
- [ ] **Step 4: Tambah e2e** `describe('catalog')`:
  - Dengan UI Indonesia, tambah "Desain logo", satuan "proyek", harga
    `1.500.000`, IDR → tabel menampilkan `Rp 1.500.000` (normalisasi nbsp).
  - Edit harga menjadi `abc` → pesan "Jumlah tidak valid".
- [ ] **Step 5:** Run `npm run test:unit && npm run test:int && npm run e2e` →
  semua PASS. `npm run lint && npm run typecheck && npm run build` bersih.
- [ ] **Step 6: Commit** `feat: add service catalog`

---

## Rencana lanjutan (plan terpisah)

- **Plan 2:** editor invoice + 3 template + preview live + duplikat (spec §5–7).
- **Plan 3:** siklus invoice, halaman publik, dan klaim bayar (§5, §6.2, §6.4–6.5).
- **Plan 4:** PDF, email, dan WhatsApp (§8–9).
- **Plan 5:** kurs dan invoice berulang (§10–11).
