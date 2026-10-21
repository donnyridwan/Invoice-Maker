# Plan 4 — PDF, Email & WhatsApp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invoice bisa dikirim lewat tiga jalur:
- **PDF:** diunduh dengan tampilan identik dengan preview.
- **Email:** dikirim dari aplikasi dengan lampiran PDF, hanya untuk akun yang email-nya sudah terverifikasi.
- **WhatsApp:** dibagikan lewat link `wa.me` dengan pesan yang sudah terisi.

Pemilik juga mendapat email notifikasi ketika klien mengirim klaim pembayaran.

**Architecture:**
- **PDF:** Chromium headless membuka halaman cetak `/print/[id]` yang dilindungi tanda tangan HMAC berumur 60 detik, lalu memanggil `page.pdf()`. Komponen template yang dipakai sama dengan preview.
- **Email:** pengiriman lewat antarmuka `EmailTransport`:
  - `resend` bila `RESEND_API_KEY` dan `EMAIL_FROM_DOMAIN` diset;
  - `file` (menulis JSON ke `var/outbox/`) untuk dev/e2e bila `EMAIL_TRANSPORT=file`;
  - selain itu `disabled`, dan UI menyembunyikan opsi email.
- **Verifikasi email:** memakai fitur `emailVerification` Better Auth dengan transport yang sama.

**Tech Stack:** `puppeteer-core`, `@sparticuz/chromium` (Vercel), `resend`, `@react-email/components`, Better Auth email verification, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-invoice-maker-mvp-design.md` (§8, §9, §6.5 notifikasi)

## Global Constraints

Semua constraint Plan 1–3 tetap berlaku. Tambahan untuk plan ini:

**PDF**
- Ukuran A4 dengan `printBackground: true` dan margin 0. Margin diatur oleh template.
- Nama file: `<nomor-invoice>.pdf`. Karakter selain `[A-Za-z0-9._-]` diganti `-`.
- Batas waktu fungsi 30 detik (`export const maxDuration = 30`).
- Halaman cetak `/print/[id]?exp=<unix>&sig=<hex>`:
  - `sig = HMAC-SHA256(PRINT_SECRET, "<id>.<exp>")`;
  - masa berlaku 60 detik;
  - tanda tangan salah atau kedaluwarsa → 404;
  - tanpa shell aplikasi, `noindex`.
- Endpoint PDF:
  - **Pemilik:** `GET /api/invoices/[id]/pdf` (butuh sesi, semua status).
  - **Publik:** `GET /i/[token]/pdf` (bukan draft).
  - Unduh PDF **tidak** mengubah status.

**Email**
- Pengirim `"{Nama Bisnis}" <invoice@{EMAIL_FROM_DOMAIN}>` dengan `reply-to` email akun pengguna.
- Prasyarat kirim: `user.emailVerified === true` dan transport ≠ disabled. Bila tidak terpenuhi → `ValidationError({_form:['emailNotVerified'|'emailDisabled']})`.
- Batas 50 email invoice per pengguna per 24 jam, dihitung dari event `sent_email` → `rateLimited`.
- Isian email:
  - CC maksimal 5 alamat valid;
  - subjek 1–200 karakter;
  - pesan ≤ 5000 karakter.
- Gagal kirim → event `email_failed` dengan `{ error }`, status tidak berubah, error dikembalikan ke UI.

**WhatsApp**
- URL: `https://wa.me/<nomor>?text=<pesan>`, atau `https://wa.me/?text=<pesan>` bila tanpa nomor.
- Normalisasi nomor:
  - buang semua selain digit (tanda `+` di depan diabaikan);
  - `0` di depan → `62`;
  - hasil kurang dari 8 digit dianggap tidak ada nomor.

## Review Focus

1. **URL cetak bocor atau dipakai ulang setelah 60 detik.** Harus 404. Mengganti `id` dengan tanda tangan lama juga harus 404. → Task 1.
2. **Klien membuka `/i/<token>/pdf` milik invoice draft** atau token acak → 404, tanpa PDF. → Task 2.
3. **Pengguna belum verifikasi memanggil action kirim email secara langsung.** Harus ditolak di server, bukan hanya disembunyikan di UI. → Task 4.
4. **Email klien kosong atau CC berisi alamat tidak valid.** Harus ada error field yang jelas, dan tidak ada email terkirim. → Task 4.
5. **Nomor WhatsApp dalam format campuran** ("+62 812-3456-7890", "0812 3456 7890", "(0812)34567890") menghasilkan `628123456789` yang sama. → Task 5.

---

## File Structure

```
src/lib/signed-url.ts
src/lib/pdf/{render.ts,browser.ts}
src/app/print/[id]/page.tsx
src/app/api/invoices/[id]/pdf/route.ts
src/app/i/[token]/pdf/route.ts
src/lib/email/{transport.ts,resend.ts,file.ts,index.ts}
src/emails/{invoice-email.tsx,verify-email.tsx,claim-notification-email.tsx}
src/features/invoices/{send-email.ts,send-email-dialog.tsx,whatsapp.ts,send-menu.tsx}
src/features/profile/verify-email-card.tsx
next.config.ts (serverExternalPackages)
tests/unit/{signed-url,whatsapp,email-content}.test.ts
tests/integration/{send-email,claim-notification}.test.ts
e2e/{pdf,email,whatsapp}.spec.ts
```

---

### Task 1: Halaman cetak bertanda tangan & render PDF

**Files:**
- Create: `src/lib/signed-url.ts`, `src/lib/pdf/{browser.ts,render.ts}`, `src/app/print/[id]/page.tsx`, `src/app/api/invoices/[id]/pdf/route.ts`
- Modify: `next.config.ts` (`serverExternalPackages: ['@sparticuz/chromium','puppeteer-core']`), `.env.example` (`PRINT_SECRET`, `APP_URL`, `CHROMIUM_PATH`), `src/proxy.ts` (`/print/*` tidak diproteksi sesi)
- Test: `tests/unit/signed-url.test.ts`, `e2e/pdf.spec.ts`

**Interfaces:**
- Produces, di `signed-url.ts`:
  - `signPrintPath(invoiceId: string, now?: number): string` → `/print/<id>?exp=…&sig=…`
  - `verifyPrintSignature(invoiceId: string, exp: string | undefined, sig: string | undefined, now?: number): boolean`. Memakai `timingSafeEqual`.
- Produces, di `pdf/browser.ts`: `launchBrowser(): Promise<Browser>`.
  - Di Vercel (`process.env.VERCEL`): `chromium.executablePath()` dan `chromium.args`.
  - Lokal: `CHROMIUM_PATH`; bila tidak ada → error yang jelas.
- Produces, di `pdf/render.ts`: `renderInvoicePdf(invoiceId: string): Promise<Uint8Array>`.
  1. Buka `${APP_URL}${signPrintPath(id)}`.
  2. Tunggu `document.fonts.ready`.
  3. Panggil `pdf({ format:'A4', printBackground:true, margin:{top:0,right:0,bottom:0,left:0} })`.
  4. Tutup browser di `finally`.
  - `APP_URL` default `http://localhost:${PORT ?? 3000}`.
- Halaman cetak: memuat invoice tanpa filter user (aman karena sudah diverifikasi tanda tangan), lalu merender `InvoiceDocumentView` dengan CSS `@page { size: A4; margin: 0 }`.
- Route pemilik: `requireUser` → `getInvoice` (`NotFound` → 404) → `renderInvoicePdf` → `Response` dengan `content-type: application/pdf` dan `content-disposition: attachment; filename="<nomor>.pdf"`.
- Tombol "Unduh PDF" di header editor dan di halaman detail. Memakai `<a href download>` tanpa mengubah status.

- [ ] **Step 1: Tulis test unit gagal** `signed-url.test.ts` (`PRINT_SECRET='test'`):
  - Path hasil sign → verifikasi `true`.
  - Pada `now + 61 dtk` → `false`.
  - `sig` diubah satu karakter → `false`.
  - `id` lain dengan `sig` yang sama → `false`.
  - `exp` atau `sig` tidak ada → `false`.
- [ ] **Step 2: Tulis e2e gagal** `pdf.spec.ts`:
  - Pemilik membuat invoice lalu `request.get('/api/invoices/<id>/pdf')` → status 200 dengan header `application/pdf`. Body diawali `%PDF-` dan memuat `/Type /Page`. Header `content-disposition` memuat `INV-`.
  - `/print/<id>` tanpa tanda tangan → 404.
  - User lain → 404.
- [ ] **Step 3:** → FAIL.
- [ ] **Step 4: Implementasi.** e2e webServer men-set `PRINT_SECRET`, `APP_URL=http://localhost:3100`, dan `CHROMIUM_PATH`.
- [ ] **Step 5:** → PASS.
- [ ] **Step 6: Commit** `feat: render invoice PDFs from a signed print page`

### Task 2: PDF publik

**Files:**
- Create: `src/app/i/[token]/pdf/route.ts`
- Modify: `src/features/public-invoice/public-invoice-view.tsx` (tombol "Unduh PDF")
- Test: `e2e/pdf.spec.ts` (`describe('public pdf')`)

**Interfaces:**
- Consumes: `getPublicInvoice(token)`, `renderInvoicePdf`.
- Route publik: tanpa sesi. `null` atau void → 404. Untuk status lain → PDF. Tidak mencatat event.

- [ ] **Step 1: Tulis e2e gagal.**
  - Invoice terkirim → `/i/<token>/pdf` 200 `application/pdf`.
  - Token draft → 404. Token acak → 404.
  - Tombol "Unduh PDF" ada di halaman publik.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3: Implementasi.**
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat: add public PDF download`

### Task 3: Transport email & verifikasi email

**Files:**
- Create: `src/lib/email/{transport.ts,resend.ts,file.ts,index.ts}`, `src/emails/verify-email.tsx`, `src/features/profile/verify-email-card.tsx`
- Modify: `src/lib/auth.ts` (`emailVerification: { sendVerificationEmail, sendOnSignUp: false, autoSignInAfterVerification: true }`), `src/app/(app)/settings/page.tsx` (kartu verifikasi di bagian Akun), `.env.example` (`RESEND_API_KEY`, `EMAIL_FROM_DOMAIN`, `EMAIL_TRANSPORT`), `.gitignore` (`var/`)
- Test: `tests/unit/email-transport.test.ts`, `e2e/email.spec.ts` (`describe('verify')`), `e2e/helpers.ts` (`readOutbox(to)`)

**Interfaces:**
- Produces, di `transport.ts`:
  - `type OutgoingEmail = { from: string; to: string[]; cc?: string[]; replyTo?: string; subject: string; html: string; text: string; attachments?: { filename: string; content: Uint8Array }[] }`
  - `interface EmailTransport { kind: 'resend'|'file'|'disabled'; send(e: OutgoingEmail): Promise<{ id: string }> }`
- Produces, di `index.ts`:
  - `getEmailTransport(): EmailTransport` dengan urutan prioritas:
    1. `EMAIL_TRANSPORT=file` → file;
    2. `RESEND_API_KEY` dan `EMAIL_FROM_DOMAIN` ada → resend;
    3. selain itu → disabled (`send` melempar).
  - `isEmailEnabled(): boolean`
  - `fromAddress(displayName: string): string` → `"<nama tanpa tanda kutip dan karakter <>>" <invoice@domain>`. Untuk transport file, domain = `example.test`.
- Transport file: menulis `var/outbox/<timestamp>-<uuid>.json` berisi `OutgoingEmail` (lampiran di-base64).
- Helper e2e `readOutbox(to: string): Promise<OutgoingEmail[]>` membaca folder outbox.
- Email verifikasi (react-email, gaya bersih): judul "Verifikasi email kamu" / "Verify your email", tombol, dan link. Bahasa mengikuti cookie locale saat permintaan dibuat (default id).
- Kartu verifikasi di Pengaturan → Akun:
  - status "Terverifikasi" (badge hijau) atau "Belum diverifikasi" dengan tombol "Kirim link verifikasi" (`authClient.sendVerificationEmail({ email, callbackURL: '/settings?verified=1' })`);
  - bila transport disabled: teks "Pengiriman email belum dikonfigurasi".

- [ ] **Step 1: Tulis test unit gagal.**
  - `fromAddress('Studio "Donny" <x>')` → `"Studio Donny x" <invoice@example.test>`.
  - Dengan `EMAIL_TRANSPORT=file`, `getEmailTransport().kind === 'file'`.
  - Tanpa env apa pun → `'disabled'` dan `isEmailEnabled() === false`.
- [ ] **Step 2: Tulis e2e gagal** `describe('verify')` (webServer `EMAIL_TRANSPORT=file`):
  - Daftar → Pengaturan menampilkan "Belum diverifikasi" → klik kirim → `readOutbox(email)` berisi 1 email dengan link.
  - Buka link → kembali ke `/settings?verified=1`, menampilkan "Terverifikasi".
- [ ] **Step 3:** → FAIL.
- [ ] **Step 4: Implementasi.**
- [ ] **Step 5:** → PASS.
- [ ] **Step 6: Commit** `feat: add email transport and email verification`

### Task 4: Kirim invoice via email & notifikasi klaim

**Files:**
- Create: `src/emails/{invoice-email.tsx,claim-notification-email.tsx}`, `src/features/invoices/{send-email.ts,send-email-dialog.tsx,email-content.ts}`
- Modify: `src/features/invoices/actions.ts` (`sendInvoiceEmailAction`), `src/features/payment-claims/queries.ts` (panggil `notifyOwnerOfClaim` setelah commit, best effort), `src/features/invoices/detail/share-menu.tsx`, `editor-header.tsx`
- Test: `tests/unit/email-content.test.ts`, `tests/integration/send-email.test.ts`, `tests/integration/claim-notification.test.ts`, `e2e/email.spec.ts` (`describe('send invoice')`)

**Interfaces:**
- Produces, di `email-content.ts` (murni):
  - `defaultInvoiceEmail(inv: { number; language; businessName; clientName; total: string; dueDate: string }): { subject: string; message: string }`
    - id: subjek `Invoice {number} dari {businessName}`, pesan `Halo {clientName},\n\nBerikut invoice {number} sebesar {total}, jatuh tempo {dueDate}.\n\nTerima kasih,\n{businessName}`.
    - en: subjek `Invoice {number} from {businessName}`, pesan `Hi {clientName},\n\nPlease find invoice {number} for {total}, due {dueDate}.\n\nThank you,\n{businessName}`.
- Produces, di `send-email.ts`:
  - `sendInvoiceEmailSchema`: `to` (email wajib), `cc` (≤5 email), `subject` (1–200), `message` (≤5000).
  - `sendInvoiceEmail(user: { id; email; emailVerified }, invoiceId: string, input: unknown, deps?: { transport?: EmailTransport; renderPdf?: (id) => Promise<Uint8Array> }): Promise<void>`
    1. `assertSendable`.
    2. Cek prasyarat (verifikasi email, transport aktif, rate limit).
    3. Render PDF.
    4. Kirim email dengan HTML `InvoiceEmail`: nama bisnis, judul total besar, jatuh tempo, pesan, tombol "Lihat invoice" → link publik, dan lampiran `<nomor>.pdf`.
    5. `markSent(…,'email')` + event `sent_email` dengan `{ to, cc }`.
    6. Bila gagal: event `email_failed`, lalu lempar `ValidationError({_form:['emailFailed']})`.
  - `notifyOwnerOfClaim(claimId, deps?)`: kirim ke email pemilik bila terverifikasi dan transport aktif. Subjek "Klien mengonfirmasi pembayaran invoice {nomor}", berisi link ke `/invoices/<id>`. Error ditangkap dan di-log, tidak dilempar.
- Dialog "Kirim lewat email":
  - isian: Kepada (default email klien), CC, Subjek, Pesan (default dari `defaultInvoiceEmail`), dan info "PDF invoice akan dilampirkan";
  - tombol "Kirim";
  - bila belum terverifikasi: dialog berisi penjelasan dan tombol "Kirim link verifikasi".

- [ ] **Step 1: Tulis test unit gagal** `email-content.test.ts` untuk kedua bahasa dengan nilai di atas.
- [ ] **Step 2: Tulis test integrasi gagal** `send-email.test.ts` (transport palsu yang merekam, `renderPdf` palsu yang mengembalikan `%PDF-` bytes):
  - **Belum verifikasi:** → `emailNotVerified`, transport tidak dipanggil.
  - **Transport disabled:** → `emailDisabled`.
  - **Input tidak valid:** `to` kosong → `fieldErrors.to`. CC `'bukan'` → `fieldErrors.cc`.
  - **Sukses:**
    - email terkirim dengan `from` memuat nama bisnis, `replyTo` = email user, dan lampiran `INV-….pdf`;
    - invoice `sent`;
    - event `sent_email`.
  - **Batas harian:** sudah ada 50 event `sent_email` dalam 24 jam → `rateLimited`.
  - **Transport melempar:** → event `email_failed`, status tetap draft.
- [ ] **Step 3: Tulis test integrasi gagal** `claim-notification.test.ts`:
  - Klaim baru pada invoice pemilik terverifikasi → transport menerima email ke pemilik.
  - Pemilik belum verifikasi → tidak ada email.
  - Transport melempar → `createPaymentClaim` tetap sukses.
- [ ] **Step 4: Tulis e2e gagal** `describe('send invoice')`:
  - Pemilik terverifikasi (lewat alur verifikasi atau helper DB `verifyEmailViaDb`) → editor → Kirim → Email → `to` sudah terisi email klien → Kirim → toast "Email terkirim" → status "Terkirim".
  - `readOutbox(klien)` memuat 1 email dengan lampiran `.pdf` dan link `/i/`.
- [ ] **Step 5:** → FAIL.
- [ ] **Step 6: Implementasi.**
- [ ] **Step 7:** → PASS.
- [ ] **Step 8: Commit** `feat: send invoices by email with PDF attachment and notify owners of claims`

### Task 5: Bagikan lewat WhatsApp & menu Kirim terpadu

**Files:**
- Create: `src/features/invoices/{whatsapp.ts,send-menu.tsx}`
- Modify: `src/features/invoices/actions.ts` (`shareWhatsAppAction`), `editor-header.tsx`, `detail/share-menu.tsx` (diganti `SendMenu`)
- Test: `tests/unit/whatsapp.test.ts`, `e2e/whatsapp.spec.ts`

**Interfaces:**
- Produces, di `whatsapp.ts` (murni):
  - `normalizeWhatsAppNumber(input: string | null | undefined): string | null`
  - `whatsAppMessage(inv: { language; clientName; number; businessName; total; dueDate; url }): string`
    - id: `Halo {clientName}, berikut invoice {number} dari {businessName} sebesar {total}, jatuh tempo {dueDate}. Lihat & bayar di sini: {url}`
    - en: `Hi {clientName}, here is invoice {number} from {businessName} for {total}, due {dueDate}. View and pay here: {url}`
  - `whatsAppUrl(number: string | null, message: string): string`
- Produces: `shareWhatsAppAction(id): Promise<ActionResult<{ url: string }>>` → `assertSendable` → `markSent(…,'whatsapp')` → URL wa.me.
- `SendMenu({ invoice, emailEnabled, emailVerified })` dipakai di editor dan detail. Item menu:
  - **Email:** membuka dialog Task 4. Disembunyikan bila transport disabled.
  - **WhatsApp:** `window.open(url,'_blank','noopener')`.
  - **Salin link.**
  - **Tandai terkirim.**

- [ ] **Step 1: Tulis test unit gagal** `whatsapp.test.ts`:
  - `normalizeWhatsAppNumber('+62 812-3456-7890') === '6281234567890'`.
  - `'0812 3456 7890'` dan `'(0812)34567890'` → `'6281234567890'`.
  - `'+1 (415) 555-0100'` → `'14155550100'`.
  - `'123'` → `null`. `null` → `null`.
  - `whatsAppUrl('6281234567890', 'Halo & bayar')` → `'https://wa.me/6281234567890?text=Halo%20%26%20bayar'`.
  - `whatsAppUrl(null, 'x')` → `'https://wa.me/?text=x'`.
  - Pesan id dan en sesuai template.
- [ ] **Step 2: Tulis e2e gagal** `whatsapp.spec.ts`:
  - Klien dengan telepon `0812 3456 7890` → Kirim → WhatsApp → popup terbuka dengan URL diawali `https://wa.me/6281234567890?text=` yang memuat `/i/` (tangkap dengan `context.waitForEvent('page')`, jangan memuat halaman eksternal: abort request ke `wa.me` via `context.route`).
  - Status menjadi "Terkirim". Timeline memuat "Dibagikan via WhatsApp".
- [ ] **Step 3:** → FAIL.
- [ ] **Step 4: Implementasi.**
- [ ] **Step 5:** Verifikasi penuh → PASS.
- [ ] **Step 6: Commit** `feat: share invoices via WhatsApp with a unified send menu`
