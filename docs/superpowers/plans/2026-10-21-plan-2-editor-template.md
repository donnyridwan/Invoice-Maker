# Plan 2 — Editor Invoice & Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pengguna bisa membuat invoice dalam editor satu halaman (form kiri + preview A4 live kanan). Editor punya:
- autosave;
- klien (pilih atau buat inline);
- item dengan autocomplete katalog dan urutan drag;
- diskon, rekening, dan catatan;
- 3 template + warna aksen;
- duplikat dan hapus draft;
- daftar invoice dasar.

**Architecture:** Fungsi murni di `src/lib/` (tanggal, kuantitas, kalkulasi, penomoran) dan `src/documents/` (data → props template) dipakai bersama oleh server dan editor client. Akibatnya preview langsung berubah tanpa round-trip ke server. Server tetap menghitung ulang total dan membangun ulang snapshot setiap kali menyimpan. Domain invoice mengikuti pola feature-folder Plan 1 (`src/features/invoices/{schema,queries,actions}.ts` + komponen).

**Tech Stack:** Next.js 16.4, React 19, Drizzle 0.45, zod 4, next-intl 4, `@dnd-kit/core` + `@dnd-kit/sortable` (drag baris), Vitest 5, Playwright 1.64.

**Spec:** `docs/superpowers/specs/2026-10-21-invoice-maker-mvp-design.md` (§4, §5, §6.3, §7)

## Global Constraints

Semua constraint Plan 1 tetap berlaku (lihat `docs/superpowers/plans/2026-10-21-plan-1-fondasi-data-master.md`). Yang tidak diubah plan ini:
- `userId` scoping dengan `NotFoundError`.
- Batas teks: nama 200, alamat/catatan 2000, satuan 30.
- Copy UI hanya di `src/messages/{id,en}.json`.
- Gaya Stripe (spec §2a).

Tambahan untuk plan ini:

**Data invoice**
- Uang: integer minor unit. Perkalian `quantityMilli × unitPriceMinor` memakai BigInt. Hasil apa pun di atas `Number.MAX_SAFE_INTEGER` ditolak dengan `ValidationError` key `amountTooLarge`.
- Kuantitas: integer per seribu (`quantityMilli`, 1,5 → 1500). Maksimal 3 desimal, harus > 0, maksimal 1.000.000 (1e9 milli).
- Tanggal invoice disimpan sebagai kolom `date` (mode string `YYYY-MM-DD`). "Hari ini" selalu dihitung di zona `Asia/Jakarta`.
- Nomor invoice: `{prefix}{tahun}-{urut 3 digit}`, misalnya `INV-2026-001`.
  - Urutan reset per tahun `issueDate`.
  - Unik per user, dijaga unique index `(user_id, number)`.
  - Batas: 1–40 karakter, `^[A-Za-z0-9/._-]+$`.
- Batas per invoice: maksimal 100 item dan 10 rekening.
- Diskon persen dalam basis poin (12,5% = 1250, maksimal 10000). Diskon nominal dalam minor unit, dibatasi ≤ subtotal.
- Status enum: `draft|sent|payment_claimed|paid|void`. Plan 2 hanya membuat `draft`.
  - Status `draft`, `sent`, `payment_claimed`: boleh disimpan.
  - Status `paid` dan `void`: ditolak dengan `ValidationError` `{ _form: ['invoiceLocked'] }`.
- Invoice dirender **hanya** dari kolom snapshot, bukan dari data live (spec §4 "Aturan snapshot").

**Template**
- Template `minimal|classic|modern`, default `minimal`.
- Dokumen berukuran A4 (210 × 297 mm). Teks dokumen mengikuti `invoice.language` (bukan locale UI).

## Review Focus

1. **Angka sangat besar.** Kuantitas 1.000.000 × harga Rp 10.000.000.000 harus menghasilkan total yang tepat, atau ditolak dengan pesan `amountTooLarge`. Tidak boleh ada angka float atau `NaN`. → Task 2.
2. **Dua tab membuat invoice bersamaan.** Lima pembuatan draft paralel harus menghasilkan lima nomor berbeda tanpa error. → Task 4.
3. **Autosave balapan.** Respons simpan lama yang datang terlambat tidak boleh menimpa isian yang lebih baru. Hanya ada satu simpan yang berjalan, dan payload terakhir selalu menang. → Task 7.
4. **Invoice lunas/void disunting lewat action langsung.** Harus ditolak dan data tidak berubah. → Task 4.
5. **Payload berisi `clientId` atau `paymentAccountIds` milik user lain.** Harus menghasilkan `NotFoundError` dan tidak ada yang tersimpan. → Task 4.

---

## File Structure

```
src/lib/{dates.ts,quantity.ts,invoice-calc.ts,numbering.ts}
src/db/schema/app.ts                       + invoices, invoiceItems, invoiceEvents, invoiceStatus enum,
                                             businessProfiles.invoiceNumberYear
drizzle/0003_*.sql
src/documents/{dictionary.ts,build-document.ts,types.ts}
src/documents/templates/{minimal.tsx,classic.tsx,modern.tsx,index.ts}
src/documents/{invoice-document-view.tsx,scaled-document.tsx}
src/features/invoices/{schema.ts,snapshots.ts,queries.ts,actions.ts}
src/features/invoices/{editor-state.ts,autosave.ts}
src/features/invoices/editor/{invoice-editor.tsx,client-section.tsx,details-section.tsx,items-section.tsx,
                              item-row.tsx,catalog-autocomplete.tsx,totals-section.tsx,payment-section.tsx,
                              appearance-section.tsx,editor-header.tsx,preview-pane.tsx}
src/features/invoices/{invoice-table.tsx,new-invoice-button.tsx,status-badge.tsx}
src/app/(app)/invoices/{page.tsx,[id]/edit/page.tsx}
tests/unit/{dates,quantity,invoice-calc,numbering,build-document,templates,editor-state,autosave}.test.ts(x)
tests/integration/invoices.test.ts
e2e/invoices.spec.ts
```

---

### Task 1: Tindak lanjut Plan 1

**Files:**
- Modify: `src/features/auth/login-form.tsx`, `src/app/(auth)/login/page.tsx`, `src/lib/money.ts`, `README.md`
- Test: `tests/unit/money.test.ts`, `e2e/foundation.spec.ts`

Detail temuan ada di `docs/superpowers/plans/2026-10-21-plan-1-followups.md` (R1, R2, R5).

- [ ] **Step 1: Tulis test gagal.**
  - Unit: `parseMoneyInput('Rp. 1.500.000','IDR','id') === 1500000` dan `parseMoneyInput('Rp.1.500.000','IDR','id') === 1500000`.
  - E2E: pengguna yang sedang login membuka `/login?expired=1` → diarahkan ke `/dashboard` dan tetap login. Buka `/dashboard` lagi → masih bisa.
- [ ] **Step 2:** Jalankan test → FAIL.
- [ ] **Step 3: Implementasi.**
  - Izinkan titik opsional setelah `Rp` di prefix mata uang.
  - Halaman `/login` (server) memanggil `getOptionalUser()`:
    - ada sesi valid → `redirect('/dashboard')`;
    - tidak ada → kirim `expired` ke form (sign-out di form hanya jalan pada kondisi ini).
  - README: Node 22.
- [ ] **Step 4:** Jalankan test → PASS.
- [ ] **Step 5: Commit** `fix: plan 1 follow-ups (expired login, Rp. prefix, README)`

### Task 2: Fungsi murni — tanggal, kuantitas, kalkulasi, penomoran

**Files:**
- Create: `src/lib/dates.ts`, `src/lib/quantity.ts`, `src/lib/invoice-calc.ts`, `src/lib/numbering.ts`
- Test: `tests/unit/{dates,quantity,invoice-calc,numbering}.test.ts`

**Interfaces:**
- Produces, di `dates.ts`:
  - `todayInJakarta(now?: Date): string` (YYYY-MM-DD)
  - `addDays(date: string, days: number): string`
  - `daysBetween(from: string, to: string): number`
  - `formatDocDate(date: string, language: 'id'|'en'): string`
  - `isIsoDate(v: string): boolean`
- Produces, di `quantity.ts`:
  - `parseQuantityInput(input: string, locale: Locale): number | null` → milli. Desimal mengikuti locale (`,` untuk id, `.` untuk en). Tidak menerima pemisah ribuan. Maksimal 3 desimal, > 0, ≤ 1e9 milli.
  - `formatQuantity(milli: number, locale: Locale): string` → tanpa nol di belakang.
- Produces, di `invoice-calc.ts`:
  - `type DiscountType = 'none'|'percent'|'fixed'`
  - `calcLineAmount(quantityMilli: number, unitPriceMinor: number): number`
  - `calcTotals(items: { quantityMilli: number; unitPriceMinor: number }[], discount: { type: DiscountType; value: number }): { lineAmounts: number[]; subtotalMinor: number; discountMinor: number; totalMinor: number }`
  - Melempar `ValidationError({ _form: ['amountTooLarge'] })` bila ada nilai > `MAX_SAFE_INTEGER`.
- Produces, di `numbering.ts`:
  - `formatInvoiceNumber(prefix: string, year: number, seq: number): string`
  - `allocateInvoiceNumber(state: { prefix: string; nextNumber: number; numberYear: number | null }, issueYear: number): { number: string; next: { nextNumber: number; numberYear: number } }`
  - `INVOICE_NUMBER_RE = /^[A-Za-z0-9/._-]{1,40}$/`

- [ ] **Step 1: Tulis test gagal.**
  - **Tanggal:**
    - `todayInJakarta(new Date('2026-10-21T18:30:00Z')) === '2026-10-22'`
    - `todayInJakarta(new Date('2026-10-21T16:59:00Z')) === '2026-10-21'`
    - `addDays('2026-12-25', 14) === '2027-01-08'`
    - `addDays('2028-02-28', 1) === '2028-02-29'`
    - `daysBetween('2026-10-21','2026-11-04') === 14`
    - `formatDocDate('2026-10-21','id') === '21 Oktober 2026'`
    - `formatDocDate('2026-10-21','en') === 'October 21, 2026'`
    - `isIsoDate('2026-02-30') === false`
  - **Kuantitas:**
    - `parseQuantityInput('1,5','id') === 1500`
    - `parseQuantityInput('1.5','en') === 1500`
    - `parseQuantityInput('2','id') === 2000`
    - `parseQuantityInput('0,0005','id') === null`
    - `parseQuantityInput('0','id') === null`
    - `parseQuantityInput('1000001','id') === null`
    - `parseQuantityInput('abc','id') === null`
    - `formatQuantity(1500,'id') === '1,5'`
    - `formatQuantity(2000,'en') === '2'`
    - `formatQuantity(1250,'en') === '1.25'`
  - **Kalkulasi:**
    - `calcLineAmount(1500, 200000) === 300000`
    - `calcLineAmount(333, 100) === 33` (33,3 → 33)
    - `calcLineAmount(335, 100) === 34` (33,5 → round half up 34)
    - `calcTotals([{quantityMilli:2000,unitPriceMinor:1500000},{quantityMilli:1000,unitPriceMinor:500000}], {type:'percent',value:1250})` → `{ lineAmounts:[3000000,500000], subtotalMinor:3500000, discountMinor:437500, totalMinor:3062500 }`
    - Diskon `fixed` 5000000 pada subtotal 3500000 → `discountMinor` 3500000 dan `totalMinor` 0.
    - `calcTotals([], {type:'none',value:0})` → semua 0.
    - `calcLineAmount(1_000_000_000, 10_000_000_000)` melempar error dengan `fieldErrors._form = ['amountTooLarge']`.
  - **Penomoran:**
    - `formatInvoiceNumber('INV-', 2026, 7) === 'INV-2026-007'`
    - `formatInvoiceNumber('', 2026, 1234) === '2026-1234'`
    - `allocateInvoiceNumber({prefix:'INV-',nextNumber:5,numberYear:2026}, 2026)` → `{ number:'INV-2026-005', next:{nextNumber:6,numberYear:2026} }`
    - Dengan `numberYear:2025` dan tahun terbit 2026 → `'INV-2026-001'` dan `next.nextNumber` 2.
    - Dengan `numberYear:null` → mulai dari `nextNumber` apa adanya, dan tahun di-set.
- [ ] **Step 2:** `npm run test:unit` → FAIL.
- [ ] **Step 3: Implementasi.**
  - `todayInJakarta` memakai `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' })`.
  - Aritmetika tanggal di UTC tengah malam.
  - Kalkulasi pakai BigInt: `(q × p + 500n) / 1000n`. Persen: `(subtotal × bp + 5000n) / 10000n`.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: add date, quantity, invoice calculation and numbering helpers`

### Task 3: Skema invoice

**Files:**
- Modify: `src/db/schema/app.ts`
- Create: `drizzle/0003_*.sql` (`npm run db:generate`)
- Test: `tests/integration/invoices-schema.test.ts`

**Interfaces:**
- Produces:
  - `invoiceStatus` pgEnum `invoice_status`: draft|sent|payment_claimed|paid|void.
  - `businessProfiles.invoiceNumberYear` integer, nullable.
  - Tabel `invoices`:
    - Kunci & status: `id` uuid pk, `userId` fk cascade, `clientId` uuid fk → clients (on delete set null, nullable), `number` text not null, `status` invoiceStatus default 'draft'.
    - Pengaturan: `currency` text, `language` text, `template` text, `accentColor` text, `issueDate` date(string), `dueDate` date(string).
    - Snapshot: `clientSnapshot` jsonb nullable, `businessSnapshot` jsonb not null, `paymentAccountsSnapshot` jsonb not null default `[]`.
    - Diskon & total: `discountType` text default 'none', `discountValue` bigint default 0, `subtotalMinor`, `discountMinor`, `totalMinor` (bigint default 0).
    - Lainnya: `notes` text, `publicToken` text not null unique.
    - Siklus hidup: `sentAt`, `firstViewedAt`, `paidAt` timestamptz nullable, `paidNote` text, `voidedAt` timestamptz.
    - `timestamps`.
    - Index: unique `(userId, number)`, index `(userId, status)`, index `(userId, issueDate)`.
  - `invoiceItems`: `id`, `invoiceId` fk cascade, `position` int, `name` text, `description` text, `quantityMilli` bigint, `unit` text, `unitPriceMinor` bigint, `amountMinor` bigint. Index `(invoiceId, position)`.
  - `invoiceEvents`: `id`, `invoiceId` fk cascade, `type` text, `meta` jsonb default `{}`, `createdAt`. Index `(invoiceId, createdAt)`.
  - Tipe snapshot di `src/features/invoices/snapshots.ts` (dipakai mulai Task 4):
    - `ClientSnapshot = { name; company?; email?; phone?; address?; country? }`
    - `BusinessSnapshot = { businessName; email?; phone?; address?; taxId?; logoUrl? }`
    - `PaymentAccountSnapshot = { id; type; label; details: Record<string,string>; currency: string | null }`
    - Kolom jsonb di-`$type<…>()`.

- [ ] **Step 1: Tulis test integrasi gagal.**
  - Insert invoice + 2 item untuk test user. Menghapus invoice ikut menghapus item (cascade).
  - Dua invoice dengan `(userId, number)` sama → error unique.
  - Menghapus klien membuat `clientId` invoice menjadi null.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementasi** skema dan migrasi. `resetDb` sudah meng-truncate semua tabel.
- [ ] **Step 4:** → PASS. Jalankan `npm run db:migrate` ke dev.
- [ ] **Step 5: Commit** `feat: add invoice, invoice item and event tables`

### Task 4: Domain invoice (queries & actions)

**Files:**
- Create: `src/features/invoices/{schema.ts,snapshots.ts,queries.ts,actions.ts}`
- Test: `tests/integration/invoices.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `calcTotals`, `allocateInvoiceNumber`, `todayInJakarta`, `addDays`, `daysBetween`.
  - Plan 1: `getProfile`, `getClient`, `getPaymentAccount`, `listPaymentAccounts`.
- Produces, di `schema.ts`:
  - `invoiceDraftSchema` (zod):

    ```
    { clientId: uuid | null,
      number: string matching INVOICE_NUMBER_RE,
      issueDate: iso date, dueDate: iso date (≥ issueDate, else fieldError dueDate 'dueBeforeIssue'),
      currency: CurrencyCode, language: 'id'|'en', template: Template, accentColor: #RRGGBB,
      discountType: DiscountType, discountValue: int ≥ 0 (percent ≤ 10000),
      notes: optionalText(2000), paymentAccountIds: uuid[] (≤10, unik),
      items: { name: text ≤200 (boleh kosong), description ≤2000, quantityMilli: int 1..1e9,
               unit ≤30, unitPriceMinor: int ≥ 0 }[] (≤100) }
    ```

    `type InvoiceDraftInput`.
- Produces, di `snapshots.ts`:
  - `clientSnapshotFrom(client: Client): ClientSnapshot`
  - `businessSnapshotFrom(profile: BusinessProfile): BusinessSnapshot`
  - `paymentAccountSnapshotFrom(a: PaymentAccount): PaymentAccountSnapshot`
- Produces, di `queries.ts`:
  - `type Invoice`, `type InvoiceItem`
  - `type InvoiceWithItems = Invoice & { items: InvoiceItem[] }`
  - `createDraftInvoice(userId, opts?: { clientId?: string }): Promise<Invoice>`
    - Default dari profil (atau dari klien bila `clientId` diberikan): currency/language, template, accent, notes.
    - `issueDate` = hari ini (Jakarta), `dueDate` = `issueDate` + `defaultDueDays`.
    - `paymentAccountIds` = rekening default aktif bila ada.
    - Nomor dialokasikan di dalam transaksi `SELECT … FOR UPDATE` pada baris profil. Bila bentrok (nomor diketik manual), naikkan urutan dan coba lagi, maksimal 50×.
    - `publicToken` = `randomBytes(16).toString('base64url')`.
    - Mencatat event `created`.
  - `getInvoice(userId, id): Promise<InvoiceWithItems>` → item urut `position`.
  - `saveInvoiceDraft(userId, id, input: unknown): Promise<{ savedAt: string; totals: { subtotalMinor; discountMinor; totalMinor } }>`
    1. Parse dengan `invoiceDraftSchema`.
    2. Status `paid`/`void` → `ValidationError({_form:['invoiceLocked']})`.
    3. `clientId` dan semua `paymentAccountIds` harus milik user; bila tidak → `NotFoundError` dan tidak ada yang ditulis.
    4. Nomor bentrok dengan invoice lain → `ValidationError({number:['duplicateNumber']})`.
    5. Hitung ulang total (`calcTotals`). Bangun ulang ketiga snapshot dari data live. Ganti semua item dalam satu transaksi.
    6. Bila status ≠ draft, catat event `edited_after_send` (paling banyak satu per 10 menit).
  - `duplicateInvoice(userId, id): Promise<Invoice>`
    - Salin semua field dan item. Nomor baru. Status draft.
    - `issueDate` = hari ini; `dueDate` = hari ini + `daysBetween(sumber.issueDate, sumber.dueDate)`.
    - Token baru. Kolom `sentAt`/`firstViewedAt`/`paidAt`/`paidNote`/`voidedAt` dikosongkan.
    - Mencatat event `duplicated` dengan `{ sourceInvoiceId }`.
    - Boleh dari status apa pun.
  - `deleteDraftInvoice(userId, id): Promise<void>` → status ≠ draft → `ValidationError({_form:['onlyDraftDeletable']})`.
  - `listInvoices(userId, { search?: string }): Promise<Invoice[]>`
    - `search` dicocokkan ILIKE pada `number` dan `clientSnapshot->>'name'`.
    - Urut `issueDate desc, number desc`.
- Produces, di `actions.ts` (semua memakai `requireUser`):
  - `createInvoiceAction(formData)` → buat draft (opsional `clientId`), lalu `redirect('/invoices/'+id+'/edit')`.
  - `saveInvoiceDraftAction(id: string, input: InvoiceDraftInput): Promise<ActionResult<{ savedAt: string }>>`
  - `duplicateInvoiceAction(id): Promise<ActionResult<{ id: string }>>`
  - `deleteDraftInvoiceAction(id): Promise<ActionResult>`

- [ ] **Step 1: Tulis test integrasi gagal** `tests/integration/invoices.test.ts`:
  - **Draft baru:** profil dengan prefix `INV-`, due 14, dan rekening default →
    - `number` = `INV-<tahun ini>-001`;
    - `dueDate` = `issueDate` + 14;
    - `paymentAccountsSnapshot.length` 1;
    - `businessSnapshot.businessName` = nama profil;
    - status `draft`;
    - ada event `created`.
  - **Pembuatan paralel:** `Promise.all` dari 5 `createDraftInvoice` → 5 nomor berbeda, …001 sampai …005.
  - **Nomor bentrok:** invoice A diberi nomor manual `INV-<tahun>-002` lewat `saveInvoiceDraft`, lalu draft baru dibuat → nomornya melewati 002.
  - **Simpan:**
    - `saveInvoiceDraft` dengan 2 item (2× Rp 1.500.000, 1× Rp 500.000) dan diskon persen 1250 → total 3062500;
    - item tersimpan berurutan;
    - `clientSnapshot` berisi nama klien.
  - **Snapshot beku:** setelah klien di-update, invoice tidak berubah sampai disimpan ulang.
  - **Validasi & kepemilikan:**
    - `clientId` milik user lain → `NotFoundError`, dan `getInvoice` tetap seperti sebelumnya.
    - `paymentAccountIds` berisi ID milik user lain → `NotFoundError`.
    - `dueDate` < `issueDate` → `fieldErrors.dueDate = ['dueBeforeIssue']`.
    - Nomor yang sama dengan invoice lain → `fieldErrors.number = ['duplicateNumber']`.
  - **Status terkunci:** invoice di-set `status='paid'` langsung lewat `testDb` → `saveInvoiceDraft` menolak dengan `invoiceLocked`, data tidak berubah. Begitu juga untuk `void`.
  - **Duplikat:** dari invoice dengan due +30 → draft baru dengan nomor berikutnya, item sama, due = hari ini + 30, token berbeda, `sentAt` null.
  - **Hapus:** `deleteDraftInvoice` pada status `sent` → `onlyDraftDeletable`. Pada draft → terhapus.
  - **Akses silang:** `getInvoice`, `saveInvoiceDraft`, `duplicateInvoice`, dan `deleteDraftInvoice` dengan ID milik user lain → `NotFoundError`.
  - **Pencarian:** `listInvoices(u, { search: 'acme' })` menemukan berdasarkan nama klien snapshot.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4:** `npm run test:int` → PASS.
- [ ] **Step 5: Commit** `feat: add invoice domain (create, save draft, duplicate, delete)`

### Task 5: Lapisan dokumen & 3 template

**Files:**
- Create: `src/documents/{types.ts,dictionary.ts,build-document.ts,invoice-document-view.tsx,scaled-document.tsx}`, `src/documents/templates/{minimal.tsx,classic.tsx,modern.tsx,index.ts}`
- Test: `tests/unit/build-document.test.ts`, `tests/unit/templates.test.tsx` (vitest environment node, `renderToStaticMarkup`)

**Interfaces:**
- Produces, di `types.ts`:
  - `InvoiceDocumentSource`: data mentah yang cukup untuk merender:
    `{ number; status; language; template; accentColor; currency; issueDate; dueDate; business: BusinessSnapshot; client: ClientSnapshot | null; paymentAccounts: PaymentAccountSnapshot[]; items: { name; description?; quantityMilli; unit?; unitPriceMinor; amountMinor }[]; subtotalMinor; discountType; discountValue; discountMinor; totalMinor; notes? }`
  - `InvoiceDocument`: semua string sudah siap tampil.
    - Header: `labels` (record dari dictionary), `number`, `issueDate`, `dueDate` ("Saat diterima"/"Due on receipt" bila sama dengan `issueDate`), `business`, `client`.
    - Isi: `items[]` dengan `{ name; description; quantity; unit; unitPrice; amount }`.
    - Ringkasan: `subtotal`, `discount` (`null` bila 0) dan `discountLabel` (misalnya "Diskon (12,5%)"), `total`, `paymentAccounts[]` (`{ title; lines: {label; value}[] }`), `notes`, `paid: boolean`.
    - Tampilan: `accentColor`, `template`, `language`.
- Produces, di `dictionary.ts`: `DOC_LABELS: Record<'id'|'en', Record<DocLabelKey, string>>`.
  - Key: `invoice`, `billTo`, `from`, `invoiceNumber`, `issueDate`, `dueDate`, `dueOnReceipt`, `description`, `quantity`, `unitPrice`, `amount`, `subtotal`, `discount`, `total`, `paymentDetails`, `notes`, `paid`, `bankName`, `accountName`, `accountNumber`, `swift`, `iban`, `email`, `instructions`.
  - Nilai `id`: "Invoice", "Ditagihkan kepada", "Dari", "No. Invoice", "Tanggal terbit", "Jatuh tempo", "Saat diterima", "Deskripsi", "Qty", "Harga", "Jumlah", "Subtotal", "Diskon", "Total", "Cara pembayaran", "Catatan", "LUNAS", "Bank", "Nama pemilik", "No. rekening", "SWIFT", "IBAN", "Email", "Instruksi".
  - Nilai `en`: "Invoice", "Bill to", "From", "Invoice no.", "Issue date", "Due date", "Due on receipt", "Description", "Qty", "Price", "Amount", "Subtotal", "Discount", "Total", "Payment details", "Notes", "PAID", "Bank", "Account name", "Account number", "SWIFT", "IBAN", "Email", "Instructions".
- Produces, di `build-document.ts`: `buildInvoiceDocument(src: InvoiceDocumentSource): InvoiceDocument`. Uang memakai `formatMoney(…, language)`, kuantitas `formatQuantity`, tanggal `formatDocDate`.
- Produces, di `templates/index.ts`: `TEMPLATE_COMPONENTS: Record<Template, (p: { doc: InvoiceDocument }) => JSX.Element>`.
- Produces, di `invoice-document-view.tsx`: `InvoiceDocumentView({ doc })` → `<article data-template={doc.template} lang={doc.language} class="invoice-page">` berukuran A4. Sudut kanan atas menampilkan cap "LUNAS" diagonal bila `doc.paid`.
- Produces, di `scaled-document.tsx` (client): `ScaledDocument({ children })` mengukur lebar kontainer lalu menskalakan halaman A4 dengan `transform: scale()`, dengan tinggi kontainer disesuaikan.
- Gaya visual template (Tailwind, ditata dalam mm/pt agar cocok untuk cetak):
  - **Minimal (default):**
    - Header: logo/nama bisnis kiri; teks "Invoice" besar dan nomor kanan.
    - Tiga kolom info: Dari, Ditagihkan kepada, dan tanggal.
    - Tabel bergaris tipis `#E3E8EE`.
    - Total tebal dengan warna aksen. Rekening dalam kotak abu muda.
  - **Classic:** heading serif (Georgia), header di tengah, tabel berbingkai, garis ganda di atas total.
  - **Modern:** blok header penuh warna aksen dengan teks putih, kartu ringkasan total membulat, label huruf kapital kecil.

- [ ] **Step 1: Tulis test gagal** `build-document.test.ts`:
  - Sumber IDR, `id`, item 1,5 × Rp 200.000, diskon 1250 →
    - `items[0].quantity === '1,5'`, `items[0].amount === 'Rp 300.000'` (nbsp dinormalisasi);
    - `discountLabel === 'Diskon (12,5%)'`;
    - `labels.billTo === 'Ditagihkan kepada'`.
  - Sumber yang sama dengan `language 'en'` dan USD → `labels.billTo === 'Bill to'`, `total` diawali `$`.
  - `dueDate === issueDate` → `dueDate === 'Saat diterima'`.
  - Rekening bank menghasilkan baris `[{label:'Bank',value:'BCA'},{label:'Nama pemilik',value:'Donny'},{label:'No. rekening',value:'1234567890'}]`. Nomor rekening **tidak** dimasking di dokumen.
  - Diskon 0 → `discount === null`.
- [ ] **Step 2: Tulis test gagal** `templates.test.tsx`: untuk setiap template, `renderToStaticMarkup(<InvoiceDocumentView doc={…}/>)`:
  - memuat nomor invoice, nama klien, total, dan `data-template="<nama>"`;
  - `paid: true` memuat "LUNAS".
- [ ] **Step 3:** → FAIL.
- [ ] **Step 4: Implementasi.** Konfigurasi vitest `unit` agar menerima `*.test.tsx` (JSX via esbuild).
- [ ] **Step 5:** → PASS. `npm run build` bersih.
- [ ] **Step 6: Commit** `feat: add invoice document model and three templates`

### Task 6: Daftar invoice, navigasi, tombol "Invoice baru", dan onboarding → editor

**Files:**
- Create: `src/app/(app)/invoices/page.tsx`, `src/features/invoices/{invoice-table.tsx,new-invoice-button.tsx,status-badge.tsx}`, `src/app/(app)/invoices/[id]/edit/page.tsx` (sementara: judul + nomor; diisi Task 7)
- Modify: `src/lib/routes.ts` (`/invoices`), `src/components/app-shell/sidebar.tsx` (item Invoice dengan ikon `FileText`, di bawah Dashboard), `src/app/(app)/dashboard/page.tsx` (tombol "Invoice baru" di header), `src/app/(app)/clients/[id]/page.tsx` (tombol "Invoice baru untuk klien ini"), `src/features/profile/actions.ts` + `onboarding-form.tsx` (selesai/lewati → buat draft → editor), `e2e/helpers.ts`
- Test: `e2e/invoices.spec.ts` (`describe('invoices list')`)

**Interfaces:**
- Consumes: `createInvoiceAction`, `listInvoices`.
- Produces:
  - `StatusBadge({ status })`, dengan pemetaan: draft → neutral "Draft", sent → info "Terkirim", payment_claimed → warning "Menunggu konfirmasi", paid → success "Lunas", void → neutral "Void". Plan 3 menambah label turunan.
  - `NewInvoiceButton({ clientId?, variant? })`: `<form action={createInvoiceAction}>` dengan tombol submit.
  - Navigasi setelah onboarding: kedua action mengembalikan `{ ok:true, data:{ redirectTo:'/invoices/<id>/edit' } }`. Form melakukan `window.location.assign(redirectTo)` (navigasi penuh, mengikuti aturan Plan 1).
  - `e2e/helpers.ts`:
    - `registerUser` dengan `onboarding: 'skip'` kini mendarat di editor. Helper lalu membuka `/dashboard`.
    - Helper baru `createInvoiceViaUi(page): Promise<string>` mengembalikan id invoice dari URL.

- [ ] **Step 1: Tulis e2e gagal** `describe('invoices list')`:
  - Pengguna baru menyelesaikan onboarding dengan "Lanjut" → URL cocok `/invoices/<uuid>/edit`, dan halaman menampilkan nomor `INV-<tahun>-001`.
  - Sidebar punya link "Invoice" → `/invoices` menampilkan tabel dengan 1 baris berbadge "Draft".
  - Klik "Invoice baru" di `/invoices` → editor dengan nomor `…-002`.
  - Dari halaman klien, "Invoice baru untuk klien ini" → editor untuk draft yang `clientId`-nya klien tersebut (nama klien terlihat).
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementasi.**
  - Tabel invoice berisi kolom Nomor, Klien, Tanggal terbit, Jatuh tempo, Jumlah (kanan, `tabular-nums`), dan Status.
  - Baris adalah link ke `/invoices/[id]/edit`. Pencarian memakai `?q=`.
- [ ] **Step 4:** Jalankan semua e2e → PASS (perbarui spec Plan 1 yang terdampak alur onboarding).
- [ ] **Step 5: Commit** `feat: add invoice list, navigation and new-invoice entry points`

### Task 7: Editor inti + preview live + autosave

**Files:**
- Create: `src/features/invoices/{editor-state.ts,autosave.ts}`, `src/features/invoices/editor/{invoice-editor.tsx,client-section.tsx,details-section.tsx,items-section.tsx,item-row.tsx,totals-section.tsx,payment-section.tsx,editor-header.tsx,preview-pane.tsx}`
- Modify: `src/app/(app)/invoices/[id]/edit/page.tsx`
- Test: `tests/unit/editor-state.test.ts`, `tests/unit/autosave.test.ts`, `e2e/invoices.spec.ts` (`describe('editor')`)

**Interfaces:**
- Consumes: `getInvoice`, `saveInvoiceDraftAction`, `buildInvoiceDocument`, `InvoiceDocumentView`, `ScaledDocument`, `listClients`, `listPaymentAccounts`, `getProfile`, plus parser/formatter dari Task 2 dan Plan 1.
- Produces, di `editor-state.ts` (murni):
  - `type EditorItem = { key: string; name; description; quantity: string; unit; unitPrice: string }`
  - `type EditorState = { clientId: string | null; number; issueDate; dueDate; currency; language; template; accentColor; discountType; discountValue: string; notes; paymentAccountIds: string[]; items: EditorItem[] }`
  - `editorStateFromInvoice(inv: InvoiceWithItems, locale: Locale): EditorState`
  - `toDraftInput(state, locale): { ok: true; input: InvoiceDraftInput } | { ok: false; errors: Record<string, string> }`
    - Baris yang semua field-nya kosong dibuang.
    - Kuantitas atau harga tidak valid → error dengan key `items.<i>.quantity` / `items.<i>.unitPrice`.
    - `discountValue` diparse sebagai persen ("12,5" → 1250) atau uang.
  - `toPreviewSource(state, ctx: { business: BusinessSnapshot; clients: ClientSnapshotWithId[]; accounts: PaymentAccountSnapshot[]; status }, locale): InvoiceDocumentSource`. Isian yang tidak valid dihitung 0, sehingga preview tetap tampil.
- Produces, di `autosave.ts`:
  - `createAutosaver<T>(save: (v: T) => Promise<boolean>, opts: { delayMs: number }): { schedule(v: T): void; flush(): Promise<void>; dispose(): void }`
    - Debounce `delayMs`.
    - Hanya satu simpan yang berjalan pada satu waktu. Payload yang dijadwalkan selama ada simpan berjalan disimpan sebagai "pending" dan hanya yang **terakhir** dikirim setelah simpan selesai.
    - `flush` menunggu sampai tidak ada simpan yang berjalan atau pending.
  - Hook `useAutosave` dengan status `'idle'|'saving'|'saved'|'error'|'invalid'`.
- Tata letak editor:
  - **Desktop:** grid 2 kolom. Kiri form `max-w-[560px]`; kanan preview sticky dengan latar `#F6F8FA`.
  - **Mobile:** tab "Isi" / "Preview".
  - **Header:** tombol kembali ke `/invoices`, nomor, `StatusBadge`, dan indikator autosave ("Menyimpan…", "Tersimpan", "Gagal menyimpan — coba lagi", "Perbaiki isian yang ditandai").
- Section form:
  - **Klien:** combobox pencarian atas klien aktif. Memilih klien mengisi mata uang dan bahasa default klien bila ada.
  - **Detail:** nomor, tanggal terbit, jatuh tempo + chip "Saat diterima · 7 · 14 · 30 hari" (relatif ke tanggal terbit), mata uang, bahasa invoice.
  - **Item:** baris berisi nama, deskripsi (textarea kecil), qty, satuan, harga, jumlah (read-only), dan hapus baris. Tombol "+ Tambah item". Enter di field harga baris terakhir menambah baris dan fokus ke nama baris baru.
  - **Total:** subtotal, diskon (tidak ada/persen/nominal + input), total.
  - **Rekening:** checkbox daftar rekening aktif dengan ringkasan `summarizePaymentAccount`. Link "Kelola rekening" membuka tab baru.
  - **Catatan:** textarea.
- Error field dari server (`fieldErrors`) ditampilkan di field terkait.

- [ ] **Step 1: Tulis test unit gagal.**
  - `editor-state.test.ts`:
    - `toDraftInput` dengan item `{quantity:'1,5', unitPrice:'200.000'}` (id, IDR) → `quantityMilli` 1500 dan `unitPriceMinor` 200000.
    - Baris kosong dibuang.
    - Harga `'abc'` → `errors['items.0.unitPrice']`.
    - Diskon persen `'12,5'` → `discountValue` 1250.
    - `editorStateFromInvoice` lalu `toDraftInput` menghasilkan nilai yang sama dengan invoice asal (round-trip).
  - `autosave.test.ts` (fake timers, `save` yang bisa di-resolve manual):
    - `schedule(a)`, maju 1000ms → `save(a)` dipanggil.
    - Selama `save(a)` berjalan, `schedule(b)` lalu `schedule(c)` → setelah `a` selesai hanya `save(c)` yang dipanggil (b tidak pernah).
    - Tidak pernah ada dua `save` berjalan bersamaan.
    - `flush` tanpa jeda menyimpan payload pending segera.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementasi** state, autosave, dan komponen editor.
- [ ] **Step 4: Tulis e2e** `describe('editor')`:
  - Buat invoice, lalu pilih klien "Acme Inc" (dibuat lewat UI klien di awal test).
  - Isi item "Desain logo", qty `2`, harga `1.500.000`. Tambah item kedua via Enter: "Revisi", qty `1,5`, harga `200.000`.
  - Preview menampilkan "Acme Inc", "Desain logo", dan total `Rp 3.300.000`.
  - Indikator menunjukkan "Tersimpan". Reload → semua isian kembali sama.
  - Ganti bahasa invoice ke English → preview menampilkan "Bill to".
  - Chip "30 hari" → jatuh tempo = tanggal terbit + 30.
  - Ganti nomor ke nomor invoice lain yang sudah ada → pesan "Nomor invoice sudah dipakai".
  - Harga `abc` → indikator "Perbaiki isian yang ditandai", dan reload menunjukkan nilai lama.
- [ ] **Step 5:** Semua test → PASS.
- [ ] **Step 6: Commit** `feat: add invoice editor with live preview and autosave`

### Task 8: Pelengkap editor

**Files:**
- Create: `src/features/invoices/editor/{catalog-autocomplete.tsx,appearance-section.tsx}`, `src/features/invoices/editor/new-client-dialog.tsx`
- Modify: `item-row.tsx`, `items-section.tsx` (dnd-kit), `client-section.tsx`, `editor-header.tsx`, `src/features/clients/actions.ts` (+ `createClientInlineAction`), `src/features/catalog/actions.ts` (+ `saveItemToCatalogAction`)
- Test: `e2e/invoices.spec.ts` (`describe('editor extras')`), `tests/integration/clients.test.ts`/`catalog.test.ts` bila action baru menambah query

**Interfaces:**
- Produces:
  - `createClientInlineAction(values): Promise<ActionResult<{ id; name; company; email; phone; address; country; defaultCurrency; defaultLanguage }>>`
  - `saveItemToCatalogAction({ name, description, unit, unitPriceMinor, currency }): Promise<ActionResult<{ id: string }>>`
  - **Autocomplete katalog** di field nama item:
    - Dropdown maksimal 8 item aktif yang namanya cocok (case-insensitive).
    - Pilih → isi nama, deskripsi, satuan, dan harga. Harga hanya diisi bila mata uang katalog = mata uang invoice; bila beda, tampilkan petunjuk "Harga katalog dalam USD".
    - Bisa dioperasikan dengan keyboard (panah, Enter, Esc).
  - Ikon "Simpan ke katalog" per baris (nonaktif bila nama kosong) → toast "Disimpan ke katalog".
  - **Drag:** handle di kiri baris memakai `@dnd-kit/sortable`. Sumber urutan adalah array `items` di state; posisi disimpan sesuai urutan.
  - **"+ Klien baru"** di combobox membuka dialog form klien singkat (nama, email, perusahaan, mata uang, bahasa). Setelah sukses, klien langsung terpilih.
  - **Tampilan:** 3 kartu thumbnail template (gambar mini dari `InvoiceDocumentView` yang diskalakan) dan input warna aksen (color input + hex) dengan 6 preset (`#5850EC`, `#0A2540`, `#00A67E`, `#E25950`, `#F5A623`, `#1A1F36`).
  - **Menu ⋯ di header:**
    - "Duplikat" → `duplicateInvoiceAction` → navigasi penuh ke editor baru.
    - "Hapus draft" (hanya status draft) → dialog konfirmasi → `deleteDraftInvoiceAction` → `/invoices`.

- [ ] **Step 1: Tulis e2e gagal** `describe('editor extras')`:
  - **Katalog:** dengan item katalog "Desain logo" IDR 1.500.000, ketik "desa" di nama item → pilih saran → harga terisi `1.500.000`.
  - **Simpan ke katalog:** item baru "Konsultasi" Rp 750.000 → "Simpan ke katalog" → `/catalog` memuat "Konsultasi".
  - **Klien inline:** "+ Klien baru" → isi "Beta LLC" → terpilih, dan preview memuat "Beta LLC".
  - **Template:** pilih "Modern" → preview `[data-template="modern"]`. Ubah warna ke `#00A67E` → reload tetap `modern` dan warnanya tersimpan.
  - **Drag:** drag baris 2 ke atas baris 1 → reload, urutan berubah.
  - **Duplikat:** URL editor baru berbeda, nomor berikutnya, item sama.
  - **Hapus:** "Hapus draft" pada draft → kembali ke `/invoices` dan nomornya tidak ada lagi di tabel. Pengguna yang menghapus satu-satunya draft melihat empty state "Belum ada invoice" dengan tombol "Invoice baru".
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4:** Verifikasi penuh → PASS:
  - `npm run test` (unit + integrasi);
  - `npm run e2e` dengan `CHROMIUM_PATH`;
  - `npm run lint`, `npm run typecheck`, `npm run build` bersih.
- [ ] **Step 5: Commit** `feat: add catalog autocomplete, inline client, templates picker, reorder, duplicate and delete`
