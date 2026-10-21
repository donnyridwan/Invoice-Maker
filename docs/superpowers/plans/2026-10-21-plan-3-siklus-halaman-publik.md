# Plan 3 — Siklus Invoice, Halaman Publik & Konfirmasi Bayar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invoice punya siklus hidup penuh:
- terkirim, dilihat, menunggu konfirmasi, lunas, dan void;
- halaman publik `/i/[token]` tempat klien melihat invoice dan mengirim "Saya sudah bayar" beserta bukti transfer;
- halaman detail invoice untuk pemilik (konfirmasi/tolak klaim, tandai lunas, void, timeline);
- daftar invoice bertab dan dashboard dengan kartu ringkasan;
- upload logo bisnis.

**Architecture:**
- Transisi status adalah fungsi domain di `src/features/invoices/lifecycle.ts`. Semua transisi ditulis dalam transaksi dan selalu mencatat `invoice_events`.
- Label turunan ("Dilihat", "Jatuh tempo") dihitung oleh fungsi murni dan tidak disimpan.
- Halaman publik tidak memakai sesi. Aksesnya hanya lewat `publicToken`.
- File (logo, bukti transfer) melewati satu antarmuka `FileStorage`:
  - **Vercel Blob** bila `BLOB_READ_WRITE_TOKEN` ada.
  - **Disk lokal** (`public/uploads/`, di-gitignore) bila tidak ada.

**Tech Stack:** Next.js 16.4, Drizzle, zod, next-intl, `@vercel/blob`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-invoice-maker-mvp-design.md` (§5, §6.2, §6.4, §6.5, §12)

## Global Constraints

Semua constraint Plan 1 & 2 tetap berlaku. Tambahan untuk plan ini:

**Status & transisi**
- Status yang tersimpan: `draft|sent|payment_claimed|paid|void`.
- Transisi yang sah (lainnya → `ValidationError({_form:['invalidTransition']})`):

  | Aksi | Dari | Ke |
  |---|---|---|
  | `markSent` | draft | sent |
  | `markPaid` | sent, payment_claimed | paid |
  | `unmarkPaid` | paid | sent |
  | `voidInvoice` | draft, sent, payment_claimed | void |
  | `createPaymentClaim` | sent, payment_claimed | payment_claimed |
  | `acceptClaim` | payment_claimed | paid |
  | `rejectClaim` | payment_claimed | sent, hanya bila tidak ada klaim pending lain |

- Syarat kirim (`markSent` dan aksi share): ada klien, minimal 1 item, total > 0. Bila tidak terpenuhi: `ValidationError` dengan `_form` berisi `clientRequired` / `itemsRequired` / `totalZero`.
- Label turunan dihitung pada "hari ini" zona Asia/Jakarta:
  - **viewed** = status `sent` dan `firstViewedAt` terisi.
  - **overdue** = status ∈ {sent, payment_claimed} dan `dueDate` < hari ini.

**Halaman publik**
- `/i/[token]`:
  - Draft atau token tak dikenal → 404. Void → halaman "Invoice ini dibatalkan".
  - `<meta name="robots" content="noindex">`.
  - Bahasa halaman = `invoice.language`.
- Klaim pembayaran:
  - Maksimal 3 klaim `pending` per invoice. Melebihi → `ValidationError({_form:['tooManyClaims']})`.
  - Jumlah > 0.
  - Tanggal bayar ≤ hari ini + 1.

**Upload**
- Logo: JPG/PNG/WebP, maksimal 2 MB.
- Bukti transfer: JPG/PNG/PDF, maksimal 5 MB.
- Tipe dicek dari *magic bytes*, bukan hanya dari MIME yang dikirim klien.
- Nama file disimpan acak (`<uuid>.<ext>`).

## Review Focus

1. **Klien mengirim klaim ke invoice draft atau void** dengan menebak token atau memakai token lama. Harus ditolak dan status tidak berubah. → Task 3.
2. **File berbahaya yang mengaku gambar** (misalnya HTML dengan `Content-Type: image/png`) harus ditolak berdasarkan magic bytes. → Task 1.
3. **Pemilik membuka link publiknya sendiri** tidak boleh menandai invoice sebagai "Dilihat". Kunjungan klien kedua kali tidak membuat event `viewed` baru. → Task 4.
4. **Dua klaim diproses bersamaan.** Menolak satu klaim saat klaim lain masih pending tidak boleh mengembalikan status ke `sent`. → Task 3.
5. **Invoice jatuh tempo tepat hari ini (WIB)** belum boleh berlabel "Jatuh tempo". Besoknya baru jatuh tempo, juga di sekitar tengah malam UTC. → Task 2.

---

## File Structure

```
src/lib/storage/{index.ts,local.ts,vercel-blob.ts,file-type.ts}
src/features/profile/logo-upload.tsx (+ actions)
src/features/invoices/{lifecycle.ts,display-status.ts,events.ts}
src/features/payment-claims/{schema.ts,queries.ts,actions.ts,claim-form.tsx,claim-list.tsx}
src/db/schema/app.ts  + paymentClaims, claimStatus enum ; drizzle/0004_*.sql
src/app/i/[token]/{page.tsx,layout.tsx,not-found.tsx}
src/features/public-invoice/{public-invoice-view.tsx,payment-methods-card.tsx,status-banner.tsx}
src/app/(app)/invoices/[id]/page.tsx
src/features/invoices/detail/{detail-panel.tsx,actions-bar.tsx,mark-paid-dialog.tsx,timeline.tsx,share-menu.tsx}
src/features/dashboard/{summary-cards.tsx,recent-invoices.tsx,queries.ts}
tests/unit/{file-type,display-status}.test.ts
tests/integration/{storage,lifecycle,payment-claims,dashboard}.test.ts
e2e/{lifecycle,public-invoice}.spec.ts
```

---

### Task 1: Penyimpanan file & upload logo

**Files:**
- Create: `src/lib/storage/{index.ts,local.ts,vercel-blob.ts,file-type.ts}`, `src/features/profile/logo-upload.tsx`
- Modify: `src/features/profile/actions.ts` (`uploadLogoAction`, `removeLogoAction`), `src/features/profile/profile-form.tsx` atau halaman settings (kartu logo), `.gitignore` (`public/uploads/`), `.env.example` (`BLOB_READ_WRITE_TOKEN` opsional)
- Test: `tests/unit/file-type.test.ts`, `tests/integration/storage.test.ts`, `e2e/foundation.spec.ts` (`describe('logo')`)

**Interfaces:**
- Produces, di `file-type.ts`:
  - `detectFileType(bytes: Uint8Array): 'jpg'|'png'|'webp'|'pdf'|null` berdasarkan magic bytes:
    - JPG `FF D8 FF`
    - PNG `89 50 4E 47 0D 0A 1A 0A`
    - WEBP `RIFF....WEBP`
    - PDF `%PDF-`
- Produces, di `storage/index.ts`:
  - `type UploadKind = 'logo' | 'payment-proof'`
  - `UPLOAD_RULES: Record<UploadKind, { types: ('jpg'|'png'|'webp'|'pdf')[]; maxBytes: number }>` → logo: jpg/png/webp, 2 MB; payment-proof: jpg/png/pdf, 5 MB.
  - `validateUpload(kind, file: { bytes: Uint8Array; size: number }): 'jpg'|'png'|'webp'|'pdf'`. Bila gagal, melempar `ValidationError({ file: ['fileType'] | ['fileTooLarge'] })`.
  - `getStorage(): FileStorage`
  - `interface FileStorage { put(kind: UploadKind, bytes: Uint8Array, ext: string): Promise<{ url: string }>; delete(url: string): Promise<void> }`
    - `local.ts` menulis ke `public/uploads/<kind>/<uuid>.<ext>` dan URL-nya `/uploads/<kind>/<uuid>.<ext>`.
    - `vercel-blob.ts` memakai `put(\`${kind}/${uuid}.${ext}\`, bytes, { access: 'public', addRandomSuffix: false })`.
  - `uploadFile(kind, file: File): Promise<{ url: string }>` = validasi + put.
- Produces di profil: `uploadLogoAction(formData)` / `removeLogoAction()` → `ActionResult<{ logoUrl: string | null }>`. Logo lama dihapus dari storage.
- Kartu "Logo" di pengaturan profil:
  - pratinjau 64px;
  - tombol "Unggah logo" / "Ganti" / "Hapus";
  - teks bantuan "JPG, PNG, atau WebP, maks. 2 MB".

- [ ] **Step 1: Tulis test unit gagal** `file-type.test.ts`:
  - Byte PNG asli → `'png'`.
  - `'%PDF-1.7'` → `'pdf'`.
  - `'<html>'` → `null`.
  - `validateUpload('logo', { bytes: pdfBytes, size: 1000 })` → `fileType`.
  - `validateUpload('logo', { bytes: pngBytes, size: 2*1024*1024+1 })` → `fileTooLarge`.
  - `validateUpload('payment-proof', { bytes: pdfBytes, size: 1000 })` → `'pdf'`.
- [ ] **Step 2: Tulis test integrasi gagal** `storage.test.ts` (tanpa token Blob): `getStorage().put('logo', pngBytes, 'png')`
  - menghasilkan URL `/uploads/logo/<uuid>.png`;
  - file ada di disk;
  - `delete` menghapusnya.
- [ ] **Step 3: Tulis e2e gagal** `describe('logo')`: unggah PNG kecil di `/settings` → gambar logo tampil. Hapus → hilang.
- [ ] **Step 4:** → FAIL.
- [ ] **Step 5: Implementasi.** Tambahkan juga label "Logo" dan pesan validasi `fileType` / `fileTooLarge` di kedua bahasa.
- [ ] **Step 6:** → PASS.
- [ ] **Step 7: Commit** `feat: add file storage abstraction and business logo upload`

### Task 2: Status turunan & transisi siklus hidup

**Files:**
- Create: `src/features/invoices/{display-status.ts,lifecycle.ts,events.ts}`
- Test: `tests/unit/display-status.test.ts`, `tests/integration/lifecycle.test.ts`

**Interfaces:**
- Produces, di `display-status.ts` (murni):
  - `type DisplayStatus = 'draft'|'sent'|'viewed'|'awaiting_confirmation'|'paid'|'overdue'|'void'`
  - `displayStatus(inv: { status; dueDate; firstViewedAt: Date | null }, today: string): DisplayStatus`. Urutan prioritas:
    1. void
    2. paid
    3. overdue (status sent/payment_claimed dan `dueDate` < today)
    4. awaiting_confirmation (payment_claimed)
    5. viewed
    6. sent
    7. draft
  - `dueRelative(dueDate: string, today: string): { kind: 'today'|'inDays'|'overdueDays'; days: number }`
- Produces, di `lifecycle.ts`. Semuanya `(userId, invoiceId, …)`, melempar `NotFoundError` untuk ID asing, dan memvalidasi transisi sesuai tabel Global Constraints:
  - `assertSendable(inv: InvoiceWithItems): void`
  - `markSent(userId, id, channel: 'manual'|'link'|'whatsapp'|'email'): Promise<Invoice>`
    - Draft → sent: set `sentAt`, catat event `sent` dengan `{ channel }`.
    - Bila sudah `sent`/`payment_claimed`/`paid`: no-op, hanya mencatat event share (`link_copied`/`shared_whatsapp`/`sent_email`). Untuk channel `manual` tidak dicatat apa-apa.
  - `markPaid(userId, id, { paidOn: string; note?: string }): Promise<Invoice>` → `paidAt` = `paidOn` 00:00 WIB, event `marked_paid`.
  - `unmarkPaid(userId, id)` → kembali `sent`, `paidAt`/`paidNote` null, event `unmarked_paid`.
  - `voidInvoice(userId, id)` → set `voidedAt`, event `voided`.
  - `recordPublicView(token: string, viewerUserId: string | null): Promise<void>`
    - Bila invoice status sent/payment_claimed/paid, `viewerUserId` ≠ pemilik, dan `firstViewedAt` null → set `firstViewedAt` dan catat event `viewed`, atomik dengan `UPDATE … WHERE first_viewed_at IS NULL`.
    - Bila tidak → no-op.
- Produces, di `events.ts`:
  - `logEvent(tx, invoiceId, type, meta?)`
  - `listEvents(userId, invoiceId): Promise<InvoiceEvent[]>` (urut terbaru dulu)
  - `type InvoiceEventType` = union semua tipe di spec §4 ditambah `unmarked_paid` dan `sent`.
- Plan 2 `saveInvoiceDraft` dan `createDraftInvoice` dialihkan memakai `logEvent` (refactor kecil, perilaku sama).

- [ ] **Step 1: Tulis test unit gagal** `display-status.test.ts`:
  - `displayStatus({status:'sent',dueDate:'2026-10-21',firstViewedAt:null}, '2026-10-21') === 'sent'` (jatuh tempo hari ini belum overdue).
  - Kasus yang sama dengan today `'2026-10-22'` → `'overdue'`.
  - Status `sent` dengan `firstViewedAt` terisi → `'viewed'`.
  - Status `payment_claimed` yang belum lewat tempo → `'awaiting_confirmation'`.
  - Status `payment_claimed` yang lewat tempo → `'overdue'`.
  - Status `paid` yang lewat tempo → `'paid'`.
  - `dueRelative('2026-10-26','2026-10-21')` → `{kind:'inDays',days:5}`.
  - `dueRelative('2026-10-18','2026-10-21')` → `{kind:'overdueDays',days:3}`.
- [ ] **Step 2: Tulis test integrasi gagal** `lifecycle.test.ts`:
  - **Syarat kirim:** `markSent` pada draft tanpa klien → `clientRequired`. Tanpa item → `itemsRequired`. Total 0 → `totalZero`.
  - **markSent:** pada draft lengkap → status `sent`, `sentAt` terisi, event `sent` dengan `{channel:'manual'}`. Memanggil `markSent(…,'link')` lagi → status tetap, event `link_copied` bertambah.
  - **markPaid / unmarkPaid:** `markPaid` dari `sent` dengan `paidOn '2026-10-20'` → status `paid`, `paidAt` = `2026-10-19T17:00:00Z`. `unmarkPaid` → `sent`.
  - **Transisi tidak sah:** `markPaid` dari `draft` → `invalidTransition`. `voidInvoice` dari `paid` → `invalidTransition`.
  - **voidInvoice:** dari `sent` → `void`, lalu `saveInvoiceDraft` ditolak `invoiceLocked`.
  - **recordPublicView:**
    - Oleh pemilik → `firstViewedAt` tetap null.
    - Oleh `null` → terisi, dan 1 event `viewed`. Dipanggil lagi → tetap 1 event.
    - Pada draft → no-op.
  - **Akses silang:** semua fungsi dengan ID user lain → `NotFoundError`.
- [ ] **Step 3:** → FAIL.
- [ ] **Step 4: Implementasi.**
- [ ] **Step 5:** → PASS.
- [ ] **Step 6: Commit** `feat: add invoice lifecycle transitions and derived status`

### Task 3: Klaim pembayaran

**Files:**
- Modify: `src/db/schema/app.ts`
- Create: `drizzle/0004_*.sql`, `src/features/payment-claims/{schema.ts,queries.ts,actions.ts}`
- Test: `tests/integration/payment-claims.test.ts`

**Interfaces:**
- Produces di skema:
  - `claimStatus` pgEnum (`pending|accepted|rejected`).
  - Tabel `paymentClaims`: `id`, `invoiceId` fk cascade, `payerName` text, `paidOn` date(string), `amountMinor` bigint, `note` text, `proofUrl` text, `status` default pending, `createdAt`, `decidedAt`. Index `(invoiceId, status)`.
- Produces, di `schema.ts`: `paymentClaimSchema` dengan field:
  - `payerName` (1–200);
  - `paidOn` (tanggal ISO ≤ hari ini + 1, bila lewat → `paidOnFuture`);
  - `amountMinor` (int > 0);
  - `note` (≤ 2000).
- Produces, di `queries.ts`:
  - `createPaymentClaim(token: string, input: unknown, proof: { bytes: Uint8Array; size: number } | null): Promise<PaymentClaim>`
    - Invoice dicari lewat token. Status draft/void/paid atau token tak dikenal → `NotFoundError` (status tidak berubah).
    - Lebih dari 3 klaim pending → `tooManyClaims`.
    - Bukti divalidasi (`payment-proof`) lalu disimpan.
    - Status invoice → `payment_claimed`, event `payment_claimed` dengan `{ claimId }`.
  - `listClaims(userId, invoiceId): Promise<PaymentClaim[]>`
  - `countPendingClaims(userId): Promise<number>`
  - `acceptClaim(userId, claimId)`:
    - klaim → accepted;
    - invoice → `paid` (`paidAt` dari `paidOn`);
    - klaim pending lain → rejected;
    - event `marked_paid` dengan `{ claimId }`.
  - `rejectClaim(userId, claimId)`:
    - klaim → rejected, event `claim_rejected`;
    - invoice kembali ke `sent` **hanya** bila tidak ada klaim pending lain;
    - semuanya dalam satu transaksi dengan `SELECT … FOR UPDATE` pada invoice.
- Produces, di `actions.ts`:
  - `submitPaymentClaimAction(token, formData)` (publik, tanpa `requireUser`) → `ActionResult`. Jumlah diparse dengan `parseMoneyInput` memakai mata uang & bahasa invoice.
  - `acceptClaimAction(claimId)` dan `rejectClaimAction(claimId)`.

- [ ] **Step 1: Tulis test integrasi gagal** `payment-claims.test.ts`:
  - **Klaim normal:** klaim pada invoice `sent` → status `payment_claimed`, klaim `pending`.
  - **Bukti:** `proofUrl` terisi bila ada bukti PNG. Bukti berupa teks HTML → `fileType` dan tidak ada klaim tersimpan.
  - **Status tidak sah:** klaim pada invoice draft, void, atau paid → `NotFoundError`, status tidak berubah.
  - **Token tak dikenal:** → `NotFoundError`.
  - **Batas pending:** klaim ke-4 saat 3 masih pending → `tooManyClaims`.
  - **Tanggal:** `paidOn` 3 hari ke depan → `paidOnFuture`.
  - **Tolak dengan klaim lain pending:** 2 klaim pending, tolak satu → status tetap `payment_claimed`. Tolak yang kedua → `sent`.
  - **Terima:** `acceptClaim` → invoice `paid`, klaim lain `rejected`.
  - **Akses silang:** `acceptClaim` dan `rejectClaim` dengan klaim milik invoice user lain → `NotFoundError`.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: add payment claims with proof upload`

### Task 4: Halaman publik klien `/i/[token]`

**Files:**
- Create: `src/app/i/[token]/{page.tsx,not-found.tsx}`, `src/features/public-invoice/{public-invoice-view.tsx,payment-methods-card.tsx,status-banner.tsx,claim-dialog.tsx}`
- Modify: `src/messages/{id,en}.json` (namespace `public`), `src/proxy.ts` hanya bila perlu (pastikan `/i/*` tidak diproteksi)
- Test: `e2e/public-invoice.spec.ts`

**Interfaces:**
- Consumes: `getInvoiceByToken` (tambahkan di `queries.ts`: `getPublicInvoice(token): Promise<InvoiceWithItems | null>`, mengembalikan `null` untuk draft dan token tak dikenal), `buildInvoiceDocument`, `InvoiceDocumentView`, `recordPublicView`, `submitPaymentClaimAction`, `displayStatus`.
- Halaman publik:
  - Latar `#F6F8FA`, kolom tengah `max-w-[860px]`. Tidak ada shell aplikasi.
  - Teks UI memakai `getTranslations({ locale: invoice.language, namespace: 'public' })`.
  - Urutan isi:
    1. **Banner status** (gaya Mercury/Square):
       - judul "{bisnis} meminta pembayaran {total}" dan "Jatuh tempo {tanggal}";
       - badge Lunas (hijau), Menunggu konfirmasi (kuning), atau Jatuh tempo (merah).
    2. **Tombol:** "Saya sudah bayar" (primary; disembunyikan bila paid/void atau sudah ada 3 klaim pending) dan "Unduh PDF" (dibuat di Plan 4; untuk sekarang jangan tampilkan tombol mati).
    3. **Dokumen invoice** dalam kartu, diskalakan dengan `ScaledDocument`.
    4. **Kartu "Cara pembayaran":** untuk tiap rekening snapshot ada judul + baris detail, dengan tombol "Salin" pada nomor rekening/IBAN/email (`navigator.clipboard`, toast "Disalin").
    5. **Footer:** "Dibuat dengan Invoice Maker".
  - Dialog klaim:
    - Isian: nama, tanggal bayar (default hari ini), jumlah (default total, terformat), catatan, upload bukti (opsional).
    - Setelah sukses: tampilan "Terima kasih — {bisnis} akan mengonfirmasi pembayaranmu".
  - Void → kartu "Invoice ini dibatalkan". Draft atau token tak dikenal → `notFound()`.
  - `generateMetadata`: `robots: { index: false }`, title "Invoice {nomor} — {bisnis}".
  - `recordPublicView(token, (await getOptionalUser())?.id ?? null)` dipanggil di server page.

- [ ] **Step 1: Tulis e2e gagal** `public-invoice.spec.ts` (context browser terpisah untuk "klien"):
  - **Persiapan:** pemilik membuat invoice lengkap (klien, item Rp 1.500.000, rekening BCA), lalu menandai terkirim lewat helper. Pakai `markSent` via UI dari Task 5 bila sudah ada, atau helper DB `markSentViaDb(id)` di `e2e/helpers.ts` yang memakai koneksi `E2E_DATABASE_URL`.
  - **Tampilan klien:** context tanpa login membuka `/i/<token>`:
    - judul memuat "meminta pembayaran" dan "Rp 1.500.000";
    - ada "Cara pembayaran" dan "BCA";
    - meta robots `noindex`.
  - **Klaim:** klik "Saya sudah bayar", isi nama "Budi", upload PNG kecil, kirim → teks "Terima kasih". Reload → badge "Menunggu konfirmasi".
  - **Bahasa:** invoice ber-`language` `en` → halaman memuat "requested a payment" dan "I've paid".
  - **Draft:** token invoice draft → 404.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: add public invoice page with payment claim`

### Task 5: Halaman detail invoice untuk pemilik

**Files:**
- Create: `src/app/(app)/invoices/[id]/page.tsx`, `src/features/invoices/detail/{detail-panel.tsx,actions-bar.tsx,mark-paid-dialog.tsx,timeline.tsx,share-menu.tsx}`, `src/features/payment-claims/claim-list.tsx`
- Modify:
  - `src/features/invoices/actions.ts` (`markSentAction`, `copyLinkAction`, `markPaidAction`, `unmarkPaidAction`, `voidInvoiceAction`);
  - `src/features/invoices/editor/editor-header.tsx` (tombol "Kirim" dengan dropdown "Salin link" + "Tandai terkirim", dan link "Lihat");
  - `src/features/invoices/invoice-table.tsx` (baris draft → editor, lainnya → detail);
  - `src/app/(app)/invoices/[id]/edit/page.tsx` (status paid/void → `redirect` ke detail).
- Test: `e2e/lifecycle.spec.ts`

**Interfaces:**
- Produces:
  - `copyLinkAction(id): Promise<ActionResult<{ url: string }>>`
    - Menjalankan `assertSendable`, lalu `markSent(…,'link')`.
    - Mengembalikan URL absolut `${APP_URL}/i/${token}`. `APP_URL` diambil dari `BETTER_AUTH_URL` atau header host.
    - Client menyalin ke clipboard + toast "Link disalin".
  - `markSentAction`, `markPaidAction(id, { paidOn, note })`, `unmarkPaidAction`, `voidInvoiceAction` → `ActionResult`.
- Halaman detail (gaya halaman detail Stripe):
  - **Kiri:** dokumen invoice (`ScaledDocument`).
  - **Kanan (360px):**
    - kartu status: `StatusBadge` dengan label turunan, total, dan jatuh tempo relatif ("dalam 5 hari" / "telat 3 hari" / "hari ini");
    - kartu aksi (lihat daftar tombol di bawah);
    - kartu **Klaim pembayaran** berisi klaim pending: nama, tanggal, jumlah, catatan, link "Lihat bukti" (tab baru), dan tombol "Konfirmasi lunas" / "Tolak";
    - kartu **Aktivitas** berisi timeline event dengan ikon, teks terjemahan, dan waktu WIB relatif.
  - Tombol di kartu aksi:
    - Edit (bila status draft/sent/payment_claimed)
    - Kirim (dropdown "Salin link" / "Tandai terkirim")
    - Tandai lunas (dialog: tanggal bayar default hari ini, catatan)
    - Batalkan lunas
    - Duplikat
    - Void (dialog konfirmasi merah)
- `StatusBadge` di-upgrade:
  - menerima `DisplayStatus`;
  - viewed → info "Dilihat";
  - overdue → danger "Jatuh tempo";
  - awaiting_confirmation → warning "Menunggu konfirmasi".

- [ ] **Step 1: Tulis e2e gagal** `lifecycle.spec.ts`:
  - **Kirim:** pemilik membuat invoice lengkap, di editor klik Kirim → "Salin link" → toast "Link disalin". Status di header menjadi "Terkirim".
  - **Detail & dilihat:** buka `/invoices/<id>` → timeline memuat "Link disalin". Klien (context lain) membuka link → pemilik reload → badge "Dilihat" dan timeline "Dilihat klien".
  - **Konfirmasi klaim:** klien mengirim klaim → pemilik melihat kartu klaim dengan "Budi" → "Konfirmasi lunas" → badge "Lunas". Link edit hilang, dan membuka `/invoices/<id>/edit` diarahkan ke detail.
  - **Batalkan lunas:** "Batalkan lunas" → "Terkirim".
  - **Tandai lunas manual:** dialog → "Lunas".
  - **Void:** invoice lain di-void → badge "Void". Halaman publiknya menampilkan "dibatalkan".
  - **Syarat kirim:** invoice tanpa klien → "Salin link" menampilkan pesan "Pilih klien terlebih dahulu".
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: add invoice detail page with lifecycle actions and timeline`

### Task 6: Daftar bertab, dashboard ringkasan, checklist

**Files:**
- Create: `src/features/dashboard/{queries.ts,summary-cards.tsx,recent-invoices.tsx}`
- Modify:
  - `src/app/(app)/invoices/page.tsx` (tab + label turunan + jatuh tempo relatif + badge "Perlu konfirmasi");
  - `src/features/invoices/queries.ts` (`listInvoices` dengan filter `tab`);
  - `src/app/(app)/dashboard/page.tsx`;
  - `src/features/profile/queries.ts` (`getChecklist` + `hasSentInvoice`);
  - `src/features/profile/checklist.tsx`.
- Test: `tests/integration/dashboard.test.ts`, `e2e/lifecycle.spec.ts` (`describe('dashboard')`)

**Interfaces:**
- Produces:
  - `listInvoices(userId, { search?; tab?: 'all'|'draft'|'unpaid'|'paid'|'void' })`. `unpaid` = sent + payment_claimed.
  - `countInvoicesByTab(userId): Promise<Record<'all'|'draft'|'unpaid'|'paid'|'void', number>>`
  - Di `dashboard/queries.ts`: `getDashboardSummary(userId, today: string): Promise<{ unpaid: CurrencyTotals; overdue: CurrencyTotals; paidThisMonth: CurrencyTotals; pendingClaims: number }>`
    - `type CurrencyTotals = { currency: CurrencyCode; totalMinor: number; count: number }[]`, diurutkan dengan base currency profil lebih dulu.
    - "Bulan ini" = bulan kalender WIB dari `paidAt`.
    - Plan 5 mengganti tampilan ini dengan konversi kurs.
- **Dashboard:**
  - header "Halo, {nama}" dengan tombol "Invoice baru";
  - tiga kartu ringkasan: Belum dibayar, Jatuh tempo, dan Lunas bulan ini (angka besar `tabular-nums` dalam base currency, mata uang lain sebagai baris kecil "+ USD 1,250.00"; jumlah invoice di bawahnya; tiap kartu link ke tab terkait);
  - banner kuning "{n} pembayaran menunggu konfirmasi" bila ada;
  - checklist (disembunyikan bila semua selesai), dengan item baru "Kirim invoice pertama";
  - "Invoice terbaru" (5 terakhir).
- **Daftar `/invoices`:**
  - tab Semua / Draft / Belum lunas / Lunas / Void, masing-masing dengan jumlah;
  - kolom jatuh tempo berisi tanggal + relatif ("telat 3 hari" berwarna merah);
  - badge kecil "Perlu konfirmasi" pada baris `payment_claimed`.

- [ ] **Step 1: Tulis test integrasi gagal** `dashboard.test.ts`:
  - **Data uji:** 2 invoice IDR `sent` (1 lewat tempo), 1 invoice USD `sent`, 1 invoice IDR `paid` bulan ini, dan 1 invoice `paid` bulan lalu.
  - **Ringkasan:**
    - `unpaid` = `[{IDR, jumlah 2 invoice, count 2}, {USD, …, count 1}]`;
    - `overdue` hanya memuat yang lewat tempo;
    - `paidThisMonth` hanya bulan ini.
  - **Hitungan tab:** `countInvoicesByTab` cocok dengan data.
  - **Isolasi:** data user lain tidak ikut terhitung.
- [ ] **Step 2: Tulis e2e gagal** `describe('dashboard')`:
  - Setelah satu invoice dikirim, dashboard menampilkan kartu "Belum dibayar" dengan "Rp 1.500.000" dan checklist "Kirim invoice pertama" tercentang.
  - Tab "Belum lunas" di `/invoices` menampilkan invoice itu.
- [ ] **Step 3:** → FAIL.
- [ ] **Step 4: Implementasi.**
- [ ] **Step 5:** Verifikasi penuh (test, e2e, lint, typecheck, build) → PASS.
- [ ] **Step 6: Commit** `feat: add invoice tabs, dashboard summary and first-invoice checklist`
