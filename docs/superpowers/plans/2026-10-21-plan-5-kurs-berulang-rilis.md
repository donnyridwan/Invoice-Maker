# Plan 5 — Kurs, Invoice Berulang & Kesiapan Rilis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan ini menutup MVP dengan tiga hal:
- **Kurs harian.** Kurs diambil otomatis dan dashboard menampilkan ringkasan dalam mata uang utama (tanda "≈").
- **Invoice berulang.** Invoice dibuat otomatis tiap pagi dan disimpan sebagai draft atau langsung dikirim lewat email.
- **Kesiapan rilis.** Rate limit berbasis database, onboarding atomik, log berkonteks, pesan error untuk input aneh, konfigurasi cron Vercel, dan dokumentasi deploy.

**Architecture:**
- Kurs disimpan per tanggal relatif terhadap EUR (format ECB/Frankfurter). Konversi antar mata uang dihitung silang lewat EUR dengan fungsi murni.
- Pekerjaan terjadwal berupa route handler `/api/cron/*` yang dilindungi `CRON_SECRET` dan dipanggil Vercel Cron. Logika intinya fungsi domain yang menerima dependensi (fetch, transport email, `today`) sehingga bisa diuji tanpa jaringan.
- Invoice berulang selalu menyalin invoice sumber versi terbaru.

**Tech Stack:** Next.js route handlers, Drizzle, Vercel Cron (`vercel.json`), Better Auth rate limit storage `database`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-invoice-maker-mvp-design.md` (§10, §11, §12, §14). Tindak lanjut: `docs/superpowers/plans/2026-10-21-plan-1-followups.md` (M7, M11, M13, M14, M15).

## Global Constraints

Semua constraint Plan 1–4 tetap berlaku. Tambahan untuk plan ini:

**Kurs**
- Sumber: `GET https://api.frankfurter.app/latest` (basis EUR). Jaringan sandbox memblokir host ini, jadi test **selalu** memakai fetch palsu.
- Mata uang yang didukung tetap `CURRENCY_CODES`. Kode tanpa kurs diabaikan.
- Konversi: `amountTo = amountFrom × (perEur[to] / perEur[from])`, dikoreksi dengan selisih desimal antar mata uang, lalu dibulatkan half up ke minor unit.
- `fx_rate_to_base` diisi dari kurs pada atau sebelum `issueDate`. Bila tidak ada, pakai kurs terbaru beserta `fx_rate_date`-nya. Mata uang yang sama dengan base → 1.

**Invoice berulang**
- Frekuensi `weekly|monthly|yearly` dengan interval 1–12.
- Bulanan memakai `anchorDay` (1–31). Bulan yang lebih pendek → hari terakhir bulan itu. Contoh: anchor 31 → 31 Jan, 28/29 Feb, 31 Mar.
- Berakhir: `never`, `after_count` (1–120), atau `on_date`.
- Cron harian 00:00 UTC (07.00 WIB) memproses jadwal aktif dengan `nextRunOn ≤ hari ini (WIB)`.
  - Tertinggal beberapa periode → dibuat satu invoice per tanggal yang terlewat, maksimal 12 per jadwal per eksekusi.
- Idempoten: unique index `(recurring_schedule_id, issue_date)` pada invoices.
- Kegagalan satu jadwal dicatat dan tidak menghentikan jadwal lain.
- Pengiriman `auto_email` hanya bila pemilik terverifikasi, email klien ada, dan transport aktif. Bila tidak, hasilnya draft dan pemilik diberi tahu.
- Invoice sumber yang di-void atau dihapus → jadwal otomatis nonaktif.

**Route cron**
- Header `Authorization: Bearer ${CRON_SECRET}` wajib. Bila tidak ada → 401.
- Respons JSON `{ processed, created, failed }`.

## Review Focus

1. **Cron dipanggil dua kali pada hari yang sama** (retry Vercel) → tidak ada invoice ganda. → Task 3.
2. **Jadwal bulanan dengan anchor 31 melewati Februari tahun kabisat** dan kembali ke 31 Maret. → Task 3.
3. **Kurs belum ada sama sekali** (deploy baru) → dashboard tetap tampil, invoice tanpa kurs dipisah dengan label "tanpa kurs", tanpa error. → Task 2.
4. **Endpoint cron diakses publik tanpa secret** → 401, tidak ada efek samping. → Task 1 & 3.
5. **Brute-force login dari banyak instans serverless** → batas tetap berlaku karena disimpan di DB. Respons 429 menampilkan "Terlalu banyak percobaan". → Task 5.

---

## File Structure

```
src/db/schema/app.ts   + exchangeRates, recurringSchedules, invoices.fxRateToBase/fxRateDate/recurringScheduleId
drizzle/0005_*.sql, 0006_*.sql
src/lib/fx.ts                       (murni: konversi)
src/features/fx/{queries.ts,fetch-rates.ts}
src/app/api/cron/{fx,recurring}/route.ts
src/lib/cron-auth.ts
src/lib/recurrence.ts               (murni: tanggal berikutnya)
src/features/recurring/{schema.ts,queries.ts,run.ts,actions.ts,recurring-dialog.tsx,schedule-card.tsx}
src/app/(app)/invoices/recurring/page.tsx
src/features/dashboard/{queries.ts,summary-cards.tsx} (konversi base)
vercel.json, docs/DEPLOY.md
tests/unit/{fx,recurrence,cron-auth}.test.ts
tests/integration/{fx,recurring,hardening}.test.ts
e2e/recurring.spec.ts
```

---

### Task 1: Kurs harian

**Files:**
- Modify: `src/db/schema/app.ts`
- Create: `drizzle/0005_*.sql`, `src/lib/fx.ts`, `src/features/fx/{queries.ts,fetch-rates.ts}`, `src/lib/cron-auth.ts`, `src/app/api/cron/fx/route.ts`, `scripts/fetch-fx.ts` (`npm run fx:fetch`)
- Modify: `src/features/invoices/queries.ts` (isi `fxRateToBase`/`fxRateDate` saat create/save/duplicate)
- Test: `tests/unit/fx.test.ts`, `tests/unit/cron-auth.test.ts`, `tests/integration/fx.test.ts`

**Interfaces:**
- Skema:
  - Tabel `exchangeRates`: `date` date(string), `currency` text, `perEur` numeric(20,10) (mode string). PK `(date, currency)`.
  - Tambahan di `invoices`: `fxRateToBase` numeric(20,10) nullable dan `fxRateDate` date nullable.
- Produces, di `fx.ts` (murni):
  - `type RateTable = Partial<Record<CurrencyCode, string>>` (perEur dalam bentuk string desimal)
  - `rateBetween(from, to, table): string | null`. Bila `from === to` → `"1"`.
  - `convertMinor(amountMinor: number, from: CurrencyCode, to: CurrencyCode, rate: string): number`. Memakai aritmetika desimal string/BigInt dengan skala 1e10, memperhitungkan selisih desimal, round half up.
- Produces, di `fetch-rates.ts`:
  - `fetchLatestRates(fetchImpl = fetch): Promise<{ date: string; rates: RateTable }>`
    - EUR = `"1"`.
    - Respons non-200 atau JSON tidak valid → melempar error.
- Produces, di `queries.ts`:
  - `saveRates(date, rates): Promise<number>` (upsert)
  - `getRateTableOnOrBefore(date): Promise<{ date: string; rates: RateTable } | null>`. Bila tidak ada data pada atau sebelum `date`, pakai tanggal terbaru yang tersedia.
  - `fxForInvoice(currency, baseCurrency, issueDate): Promise<{ rate: string; date: string } | null>`
- Produces, di `cron-auth.ts`: `isAuthorizedCron(request: Request): boolean` (perbandingan aman waktu-konstan).
- Route `GET /api/cron/fx` → `fetchLatestRates` → `saveRates` → `{ date, saved }`.

- [ ] **Step 1: Tulis test unit gagal** `fx.test.ts`:
  - **Kurs antar mata uang:** dengan `{EUR:'1', USD:'1.08', IDR:'17000'}`:
    - `rateBetween('USD','IDR')` → kira-kira `'15740.7407407407'` (bandingkan sampai 6 desimal);
    - `rateBetween('IDR','IDR') === '1'`.
  - **Konversi:**
    - `convertMinor(100, 'USD','IDR', '15740.7407407407') === 15741` ($1,00 → Rp 15.741);
    - `convertMinor(1574074, 'IDR','USD', '0.0000635294')` → 10000 ±1 sesuai pembulatan yang ditetapkan test.
  - **Kurs hilang:** `rateBetween('USD','THB', tabel_tanpa_THB) === null`.
- [ ] **Step 2: Tulis test unit gagal** `cron-auth.test.ts`:
  - Bearer benar → `true`.
  - Salah, tanpa header, atau `CRON_SECRET` kosong → `false`.
- [ ] **Step 3: Tulis test integrasi gagal** `fx.test.ts`:
  - `fetchLatestRates` dengan fetch palsu `{ date:'2026-10-20', base:'EUR', rates:{ USD:1.08, IDR:17000 } }` → `saveRates` → `getRateTableOnOrBefore('2026-10-21').date === '2026-10-20'`.
  - Invoice USD milik profil dengan base IDR yang disimpan setelah kurs ada → `fxRateToBase` ≈ 15740.74 dan `fxRateDate` `'2026-10-20'`.
  - Tanpa data kurs → kedua kolom null.
  - Fetch palsu status 500 → melempar error, tabel tidak berubah.
- [ ] **Step 4:** → FAIL.
- [ ] **Step 5: Implementasi.**
- [ ] **Step 6:** → PASS.
- [ ] **Step 7: Commit** `feat: add daily exchange rates and per-invoice base-currency rate`

### Task 2: Ringkasan dashboard dalam mata uang utama

**Files:**
- Modify: `src/features/dashboard/{queries.ts,summary-cards.tsx}`
- Test: `tests/integration/dashboard.test.ts` (tambah kasus), `e2e/lifecycle.spec.ts` (`describe('dashboard')` diperbarui)

**Interfaces:**
- `getDashboardSummary(userId, today)` kini mengembalikan untuk setiap kartu:
  - `{ baseCurrency; totalBaseMinor: number; converted: boolean; rateDate: string | null; withoutRate: CurrencyTotals; count: number }`
  - Invoice ber-mata uang base dijumlahkan langsung.
  - Invoice lain dikonversi memakai `fxRateToBase` miliknya. Bila null, dicoba kurs terbaru. Bila tetap tidak ada, masuk ke `withoutRate`.
  - `converted = true` bila ada minimal satu konversi.
- Tampilan kartu:
  - angka besar `formatMoney(totalBaseMinor, base)`, diawali "≈ " bila `converted`;
  - tooltip "Dikonversi dengan kurs {tanggal}";
  - baris kecil "+ USD 120.00 tanpa kurs" bila `withoutRate` tidak kosong.

- [ ] **Step 1: Tulis test integrasi gagal.**
  - Dua invoice `sent`: IDR 1.000.000 dan USD 100,00 dengan `fxRateToBase` `'15000'` → `unpaid.totalBaseMinor` = 2.500.000 dan `converted` true.
  - Invoice USD tanpa kurs dan tidak ada tabel kurs → masuk `withoutRate`, total base hanya IDR.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4:** → PASS. Perbarui e2e dashboard bila teks berubah.
- [ ] **Step 5: Commit** `feat: show dashboard totals in base currency with conversion hints`

### Task 3: Domain invoice berulang & cron

**Files:**
- Modify: `src/db/schema/app.ts`
- Create: `drizzle/0006_*.sql`, `src/lib/recurrence.ts`, `src/features/recurring/{schema.ts,queries.ts,run.ts}`, `src/app/api/cron/recurring/route.ts`
- Test: `tests/unit/recurrence.test.ts`, `tests/integration/recurring.test.ts`

**Interfaces:**
- Skema:
  - Tabel `recurringSchedules`:
    - Kunci: `id`, `userId` fk cascade, `sourceInvoiceId` fk → invoices (on delete set null).
    - Jadwal: `frequency` pgEnum `recurring_frequency`, `interval` int, `anchorDay` int, `nextRunOn` date.
    - Berakhir: `endType` pgEnum `recurring_end` (`never|after_count|on_date`), `endCount` int, `endDate` date, `runsDone` int default 0.
    - Pengiriman & status: `delivery` pgEnum (`draft|auto_email`), `active` bool default true, `lastError` text, `timestamps`.
    - Index `(active, nextRunOn)`.
  - Tambahan di `invoices`: `recurringScheduleId` uuid fk set null, plus unique index `(recurring_schedule_id, issue_date)`.
- Produces, di `recurrence.ts` (murni):
  - `nextRunDate(current: string, s: { frequency; interval; anchorDay }): string`
  - `isFinished(s: { endType; endCount; endDate; runsDone }, nextRunOn: string): boolean`
  - `dueRunDates(s, today: string, max = 12): string[]` → semua tanggal jalan yang `≤ today`, maksimal `max`.
- Produces, di `schema.ts`: `recurringScheduleSchema` dengan field:
  - `frequency`, `interval` (1–12), `nextRunOn` (≥ hari ini);
  - `endType`, plus `endCount` (1–120) atau `endDate` (> `nextRunOn`) sesuai tipe;
  - `delivery`.
- Produces, di `queries.ts`:
  - `createSchedule(userId, sourceInvoiceId, input)`
    - Satu jadwal aktif per invoice sumber. Bila sudah ada → `scheduleExists`.
    - `anchorDay` = hari dari `nextRunOn`.
    - Sumber void → `invalidTransition`.
  - `updateSchedule(userId, id, input)`
  - `pauseSchedule`, `resumeSchedule`, `deleteSchedule`
  - `getScheduleForInvoice(userId, invoiceId)`
  - `listSchedules(userId)` → disertai nomor, klien, dan total dari invoice sumber.
- Produces, di `run.ts`: `runDueSchedules(today: string, deps: { sendInvoiceEmail?: typeof sendInvoiceEmail; transport?; renderPdf? }): Promise<{ processed: number; created: number; failed: number }>`. Untuk setiap jadwal aktif yang jatuh tempo, dalam transaksinya sendiri:
  1. Untuk setiap tanggal dari `dueRunDates`, buat invoice dari sumber:
     - salin item dan pengaturan (seperti `duplicateInvoice`), lalu snapshot ulang dari data live;
     - beri nomor baru;
     - `issueDate` = tanggal jalan, `dueDate` = tanggal jalan + selisih hari sumber;
     - `recurringScheduleId` diisi;
     - catat event `recurring_generated` dengan `{ scheduleId, runDate }`.
     - Bila unique index bentrok, lewati tanggal tersebut (idempoten).
  2. Majukan `nextRunOn` dan tambah `runsDone`.
  3. Bila `isFinished` → `active = false`.
  4. Untuk `delivery = auto_email` yang memenuhi syarat → `sendInvoiceEmail` dengan isi default. Bila gagal, invoice tetap draft, `lastError` diisi, dan event `email_failed` dicatat.
  5. Sumber hilang atau void → `active = false` dan `lastError = 'sourceUnavailable'`.
- Route `GET /api/cron/recurring` → `isAuthorizedCron` → `runDueSchedules(todayInJakarta())`.

- [ ] **Step 1: Tulis test unit gagal** `recurrence.test.ts`:
  - **Bulanan:**
    - `nextRunDate('2028-01-31', {frequency:'monthly',interval:1,anchorDay:31}) === '2028-02-29'`
    - lalu `nextRunDate('2028-02-29', …sama) === '2028-03-31'`
    - `nextRunDate('2026-10-15', {monthly, interval:3, anchorDay:15}) === '2027-01-15'`
  - **Mingguan:** `nextRunDate('2026-10-21', {weekly, interval:2}) === '2026-11-04'`.
  - **Tahunan:** `nextRunDate('2028-02-29', {yearly, interval:1, anchorDay:29}) === '2029-02-28'`.
  - **dueRunDates:** jadwal bulanan dengan `nextRunOn` `'2026-07-01'` dan today `'2026-10-21'` → `['2026-07-01','2026-08-01','2026-09-01','2026-10-01']`.
  - **isFinished:**
    - `after_count` 3 dengan `runsDone` 3 → `true`;
    - `on_date` `'2026-12-31'` dengan next `'2027-01-01'` → `true`.
- [ ] **Step 2: Tulis test integrasi gagal** `recurring.test.ts`:
  - **Run normal:** jadwal bulanan `delivery: draft` dengan `nextRunOn` = today → `runDueSchedules(today)` → 1 invoice draft baru dengan nomor berikutnya, item sama, `issueDate` today. `nextRunOn` maju 1 bulan. Event `recurring_generated` tercatat.
  - **Idempoten:** `runDueSchedules(today)` kedua kalinya → tidak ada invoice baru.
  - **Mengejar ketertinggalan:** jadwal tertinggal 3 bulan → 3 invoice dibuat dengan tanggal masing-masing.
  - **Selesai:** `after_count 1` → setelah run, `active` false.
  - **auto_email:** dengan pemilik terverifikasi dan transport palsu → invoice `sent` dan transport dipanggil. Pemilik belum verifikasi → draft dan `lastError` terisi.
  - **Sumber void:** → jadwal nonaktif dengan `lastError = 'sourceUnavailable'`.
  - **Kegagalan terisolasi:** satu jadwal melempar (sumber rusak) → jadwal lain tetap diproses, `failed` = 1.
  - **Validasi & akses:** `createSchedule` kedua untuk sumber yang sama → `scheduleExists`. Akses jadwal user lain → `NotFoundError`.
  - **Route cron:** tanpa secret → 401 dan tidak ada invoice baru. Uji route handler langsung dengan `new Request`.
- [ ] **Step 3:** → FAIL.
- [ ] **Step 4: Implementasi.**
- [ ] **Step 5:** → PASS.
- [ ] **Step 6: Commit** `feat: add recurring invoice schedules and daily cron`

### Task 4: UI invoice berulang

**Files:**
- Create: `src/features/recurring/{actions.ts,recurring-dialog.tsx,schedule-card.tsx}`, `src/app/(app)/invoices/recurring/page.tsx`
- Modify:
  - menu ⋯ editor dan halaman detail ("Jadikan berulang" / "Atur jadwal berulang");
  - detail panel (kartu jadwal);
  - sidebar (sub-item "Berulang" di bawah Invoice, atau tab di `/invoices`; pilih tab "Berulang" di `/invoices` untuk menjaga sidebar ringkas);
  - `src/lib/routes.ts` bila perlu.
- Test: `e2e/recurring.spec.ts`

**Interfaces:**
- Produces: `createScheduleAction`, `updateScheduleAction`, `pauseScheduleAction`, `resumeScheduleAction`, `deleteScheduleAction` → `ActionResult`.
- Dialog "Jadikan berulang":
  - Isian:
    - frekuensi (segmented: Mingguan/Bulanan/Tahunan) + "setiap N";
    - tanggal invoice berikutnya;
    - berakhir (radio: Tidak pernah / Setelah N kali / Pada tanggal);
    - pengiriman (radio: "Buat draft & beri tahu saya" (default) / "Kirim email otomatis", nonaktif dengan alasan bila email belum terverifikasi atau klien tanpa email).
  - Ringkasan kalimat: "Invoice dibuat setiap bulan pada tanggal 15, mulai 15 Nov 2026."
- Kartu jadwal di detail: ringkasan, berikutnya, sudah dibuat N kali, `lastError` (merah), dan tombol Jeda / Lanjutkan / Ubah / Hentikan.
- Tab "Berulang" di `/invoices`: tabel jadwal (invoice sumber, klien, frekuensi, berikutnya, status Aktif/Dijeda/Selesai).

- [ ] **Step 1: Tulis e2e gagal** `recurring.spec.ts`:
  - **Buat jadwal:** invoice → ⋯ → "Jadikan berulang" → Bulanan, mulai hari ini → Simpan → kartu jadwal tampil "Aktif".
  - **Picu cron:** test memanggil `request.get('/api/cron/recurring', { headers: { Authorization: 'Bearer <CRON_SECRET e2e>' } })` → respons `created` 1. `/invoices` kini punya invoice baru dengan nomor berikutnya.
  - **Jeda:** "Jeda" → status "Dijeda". Tab "Berulang" menampilkan jadwal.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementasi.** e2e webServer men-set `CRON_SECRET`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: add recurring invoice UI`

### Task 5: Hardening rilis

**Files:**
- Modify:
  - `src/lib/auth.ts` (`rateLimit: { storage: 'database', customRules: { '/sign-in/email': { window: 60, max: 5 }, '/sign-up/email': { window: 60, max: 5 } } }`, tetap dimatikan bila `AUTH_RATE_LIMIT_DISABLED=true`) + migrasi tabel `rateLimit` Better Auth;
  - `login-form.tsx` / `register-form.tsx` (status 429 → `auth.tooManyAttempts` "Terlalu banyak percobaan. Coba lagi sebentar lagi.");
  - `src/features/profile/actions.ts` + `queries.ts` (`finishOnboarding` dalam satu transaksi: profil + rekening + `completeOnboarding`);
  - `src/lib/action-result.ts` (`toActionError(e, context?)` → `console.error` dengan `{ userId, entity, id }` tanpa payload);
  - `src/lib/validation-message.ts` (key validasi tak dikenal → `validation.invalid` "Isian tidak valid");
  - `src/app/(app)/layout.tsx` + `src/features/profile/queries.ts` (M15: `ensureProfile` lalu `getProfile` dalam urutan deterministik; tidak ada race);
  - `README.md`.
- Create: `vercel.json`, `docs/DEPLOY.md`
- Test: `tests/integration/hardening.test.ts`, `e2e/foundation.spec.ts` (`describe('rate limit')` dengan server ber-rate-limit aktif tidak praktis, sehingga diuji di unit/integration memakai `auth.api` langsung)

**Interfaces:**
- `vercel.json`:

  ```json
  { "crons": [
      { "path": "/api/cron/fx", "schedule": "0 17 * * *" },
      { "path": "/api/cron/recurring", "schedule": "0 0 * * *" } ],
    "functions": { "src/app/api/invoices/[id]/pdf/route.ts": { "maxDuration": 30, "memory": 1024 },
                   "src/app/i/[token]/pdf/route.ts": { "maxDuration": 30, "memory": 1024 } } }
  ```

- `docs/DEPLOY.md` berisi:
  - langkah membuat proyek Neon + `DATABASE_URL` (pooled);
  - Vercel project, semua env (§14 + `PRINT_SECRET`, `CRON_SECRET`, `APP_URL`, `EMAIL_FROM_DOMAIN`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`);
  - verifikasi domain di Resend;
  - menjalankan migrasi (`npm run db:migrate` dengan `DATABASE_URL` produksi);
  - menjalankan `npm run fx:fetch` sekali;
  - checklist uji setelah deploy.

- [ ] **Step 1: Tulis test integrasi gagal** `hardening.test.ts`:
  - **Rate limit:** dengan rate limit aktif (instance `auth` test dengan `rateLimit.enabled: true`, storage database), 6 percobaan `signInEmail` salah dalam 60 detik → percobaan ke-6 berstatus 429, dan baris tercatat di tabel rate limit.
  - **Onboarding atomik:** `finishOnboarding` dengan rekening tidak valid → profil **tidak** berubah dan `onboardingCompletedAt` tetap null.
  - **Pesan validasi:** `translateValidation` dengan key tak dikenal → teks "Isian tidak valid".
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementasi** semua butir di atas.
- [ ] **Step 4:** Verifikasi penuh → PASS:
  - `npm run test`;
  - `npm run e2e`;
  - `npm run lint`, `npm run typecheck`, `npm run build`.
- [ ] **Step 5: Commit** `chore: release hardening (DB rate limit, atomic onboarding, error context, cron config, deploy docs)`
