# Invoice Maker — Desain MVP

Tanggal: 2026-10-21
Status: Draft untuk direview

## 1. Ringkasan

SaaS pembuatan invoice untuk **freelancer & kreator Indonesia** yang juga menagih
klien luar negeri. Masalah utama yang diselesaikan: **membuat invoice itu lama dan
ribet**. Karena itu, seluruh keputusan produk diukur dari satu pertanyaan:
*apakah ini membuat invoice berikutnya lebih cepat dibuat dan dikirim?*

Pembayaran tetap **manual** (transfer ke rekening yang tercantum di invoice).
Produk **gratis** selama fase validasi.

### Ukuran keberhasilan MVP

- Pengguna baru bisa mengirim invoice pertama **< 3 menit** setelah daftar.
- Invoice berikutnya untuk klien yang sama (duplikat / berulang) **< 30 detik**.
- Preview, link publik, dan PDF tampil **identik**.

### Keputusan dari sesi brainstorming

| Aspek | Keputusan |
|---|---|
| Pengguna | Freelancer / kreator perorangan (1 akun = 1 bisnis = 1 orang) |
| Pasar | Indonesia + klien luar negeri |
| Pembayaran | Manual; rekening terstruktur; klien bisa kirim konfirmasi "Saya sudah bayar" |
| Fitur cepat | Database klien, katalog jasa, duplikat invoice, invoice berulang |
| Pengiriman | Unduh PDF, link publik, email dari aplikasi, share WhatsApp |
| Editor | Form di kiri + preview live di kanan |
| Internasional | Invoice ID/EN, multi-mata uang, kurs otomatis (untuk ringkasan), UI dwibahasa |
| Pajak | Tidak ada di MVP |
| Tampilan | 3 template + logo + warna aksen |
| Login | Email + password, tanpa verifikasi saat daftar |
| Platform | Web responsif — Next.js + Neon Postgres + Vercel |
| Bisnis | Gratis dulu |

### Di luar cakupan MVP (sengaja)

Pajak (PPN/PPh), payment gateway, pengingat otomatis jatuh tempo, pembayaran
sebagian/termin, quotation, tim/multi-user, multi-bisnis per akun, ekspor CSV,
laporan lanjutan, aplikasi mobile native, custom domain, paket berbayar.

## 2. Referensi UI (Mobbin)

- Editor form + preview: [Revolut Business](https://mobbin.com/screens/96f25163-6586-442c-93dc-a627339d1410),
  [Stripe](https://mobbin.com/screens/64d5b148-7b89-43f6-8b47-be2284b6221b)
- Alur buat → kirim: [Acctual](https://mobbin.com/flows/164ea2a9-05d1-44d3-9d7b-61d2afeba6cc),
  [Contra](https://mobbin.com/flows/e3e881af-2158-4bbb-8a81-c1dfc35cf0f9)
- Daftar invoice + kartu ringkasan: [Midday](https://mobbin.com/screens/ab800b0e-8693-4df7-8a3f-f6ef12a33219)
- Halaman bayar untuk klien: [Mercury](https://mobbin.com/screens/4942a92a-7afb-42d4-b892-6162970c5f0e),
  [Square](https://mobbin.com/screens/830087fe-1ffe-40bf-b406-f277e8c12e0e)
- Checklist onboarding: [Squarespace](https://mobbin.com/screens/97845c62-3be8-4cb2-a048-ec46ca5c8de4)

## 2a. Gaya Visual

Gaya Wise
([Wise home](https://mobbin.com/screens/ede78e65-ca02-449f-96c0-f36420fe9281),
[Wise send](https://mobbin.com/screens/ebc6f8fd-a5eb-44be-b881-1f023bc32f88)):

- Biru tua yang soft: tombol utama dan tinta aksen navy kalem `#2F4B73` (teks
  tombol putih), teks `#111827`, teks sekunder `#5B6577`, kanvas `#F2F5F9`,
  border `#E1E7EF`. Merah (`#C4271C`) untuk error, aksi hapus, dan status Jatuh
  tempo.
- Tombol berbentuk pil: utama biru, sekunder bergaris. Input setinggi 44px
  dengan radius 10px.
- Kartu dan panel membulat (20–24px), sebagian di atas kanvas tanpa border.
  Tab dan filter berupa pil; pil aktif biru.
- Font Inter, ukuran dasar 14px, judul halaman 30px extrabold, angka nominal
  utama (total tagihan, kartu ringkasan) black weight `tabular-nums`. Wordmark
  "Invoice Maker" black weight biru.
- Badge status: Lunas hijau muda, Terkirim/Dilihat biru muda, Menunggu
  konfirmasi kuning, Draft/Void abu, Jatuh tempo merah muda.
- Tabel padat dengan baris setinggi ±44px dalam kartu membulat. Empty state
  memakai kotak bergaris putus-putus.
- Template dokumen invoice tetap bersih dan minimal; warna aksen default
  dokumen `#2F4B73` (pengguna bisa memilih warna lain). Template default:
  **Minimal**.

## 3. Arsitektur

Satu aplikasi **Next.js (App Router, TypeScript)** di Vercel. Tidak ada service
terpisah.

| Kebutuhan | Pilihan | Alasan |
|---|---|---|
| UI | Tailwind CSS + shadcn/ui | Cepat dibangun, komponen form lengkap |
| Database | Neon Postgres + Drizzle ORM (driver `postgres`, drizzle-kit migrations); Postgres 16 lokal untuk dev & test | Serverless, type-safe, migrasi tercatat di repo |
| Auth | Better Auth (email + password, adapter Drizzle) | Session di DB sendiri, dukung verifikasi email opsional |
| i18n UI | next-intl, locale `id` (default) & `en`, disimpan di cookie/profil (tanpa prefix URL) | |
| PDF | Chromium headless (`puppeteer-core` + `@sparticuz/chromium` di Vercel) membuka halaman cetak | Satu template HTML untuk preview, link publik, dan PDF |
| Email | Resend + React Email | Lampiran PDF, free tier cukup untuk validasi |
| File (logo, bukti transfer) | Vercel Blob | Terintegrasi dengan Vercel |
| Kurs | Frankfurter API (kurs referensi ECB, tanpa API key) | Gratis, mencakup IDR, USD, SGD, EUR, AUD, GBP, MYR, JPY, dll. |
| Job terjadwal | Vercel Cron → route handler dengan `CRON_SECRET` | Invoice berulang & update kurs harian |
| Test | Vitest (unit) + Playwright (e2e) | |

### Struktur modul

```
src/
  app/
    (auth)/          login, daftar, lupa password
    (app)/           dashboard, invoices, clients, catalog, settings  — butuh login
    i/[token]/       halaman publik invoice untuk klien
    print/[id]/      halaman cetak (hanya untuk Chromium, URL bertanda tangan)
    api/
      invoices/[id]/pdf/    unduh PDF
      cron/recurring/       buat invoice berulang
      cron/fx/              ambil kurs harian
  db/                schema Drizzle + migrations
  lib/
    money.ts         aritmetika uang (integer minor unit) & format
    invoice-calc.ts  hitung subtotal/diskon/total
    numbering.ts     nomor invoice berikutnya
    fx.ts            konversi mata uang
    recurring.ts     hitung tanggal jalan berikutnya
    whatsapp.ts      normalisasi nomor & link wa.me
    pdf.ts           render PDF via Chromium
    signed-url.ts    tanda tangan HMAC untuk halaman cetak
  documents/
    templates/       minimal.tsx, classic.tsx, modern.tsx
    dictionary.ts    teks dokumen invoice dalam ID/EN
    build-document.ts  ubah data invoice → props template (string siap tampil)
  messages/          id.json, en.json (teks UI aplikasi)
```

Fungsi-fungsi di `lib/` dan `documents/build-document.ts` dibuat **murni** (tanpa
akses DB) supaya mudah diuji unit.

## 4. Model Data

Semua tabel milik pengguna punya `user_id` dan **setiap query wajib difilter
`user_id`** melalui helper `requireUser()`.

**Uang** disimpan sebagai `bigint` minor unit per mata uang. Tabel konstanta
mata uang menentukan jumlah desimal (IDR & JPY = 0, USD/SGD/EUR = 2).
**Kuantitas** disimpan sebagai integer per seribu (`quantity_milli`, 1,5 jam =
1500) agar jam kerja desimal tetap presisi.

### Tabel

- **Tabel Better Auth**: `user`, `session`, `account`, `verification`
  (`user.email_verified` dipakai untuk mengunci fitur kirim email).

- **business_profiles** (1:1 dengan user): `business_name`, `email`, `phone`,
  `address`, `tax_id` (teks opsional, hanya ditampilkan), `logo_url`,
  `accent_color`, `default_template` (`minimal|classic|modern`),
  `base_currency` (default `IDR`, untuk ringkasan), `default_currency`,
  `default_language` (`id|en`), `default_due_days` (default 14),
  `invoice_prefix` (default `INV-`), `next_invoice_number` (int),
  `default_notes`, `ui_locale`, `onboarding_completed_at`.

- **payment_accounts**: `type` (`bank|paypal|wise|swift|other`), `label`,
  `details` (jsonb, kunci camelCase: `bankName`, `accountName`,
  `accountNumber`, `swift`, `iban`, `email`, `instructions`), `currency`
  (opsional; `NULL` = semua mata uang), `is_default` (maksimal satu rekening
  aktif per user, dijamin indeks unik parsial), `archived_at`.

- **clients**: `name`, `company`, `email`, `phone` (untuk WhatsApp),
  `address`, `country`, `default_currency`, `default_language`, `notes`,
  `archived_at`.

- **catalog_items**: `name`, `description`, `unit` (teks bebas: jam, hari,
  proyek, …), `unit_price_minor`, `currency`, `archived_at`.

- **invoices**:
  - `id` (uuid), `user_id`, `client_id` (nullable)
  - `number` (unik per user), `status` (`draft|sent|payment_claimed|paid|void`)
  - `currency`, `language`, `template`, `accent_color`
  - `issue_date`, `due_date`
  - `client_snapshot`, `business_snapshot`, `payment_accounts_snapshot` (jsonb)
  - `discount_type` (`none|percent|fixed`), `discount_value` (bigint: basis poin
    untuk persen — 12,5% = 1250; minor unit untuk nominal)
  - `subtotal_minor`, `discount_minor`, `total_minor`
  - `notes`, `public_token` (acak 128-bit, base64url)
  - `fx_rate_to_base` (numeric) + `fx_rate_date`
  - `sent_at`, `first_viewed_at`, `paid_at`, `paid_note`, `voided_at`
  - `recurring_schedule_id` (nullable), `created_at`, `updated_at`

- **invoice_items**: `invoice_id`, `position`, `name`, `description`,
  `quantity_milli`, `unit`, `unit_price_minor`, `amount_minor`.

- **payment_claims**: `invoice_id`, `payer_name`, `paid_on`, `amount_minor`,
  `note`, `proof_url`, `status` (`pending|accepted|rejected`), `created_at`.

- **recurring_schedules**: `source_invoice_id`, `frequency`
  (`weekly|monthly|yearly`), `interval` (setiap N), `next_run_on`,
  `end_type` (`never|after_count|on_date`), `end_count`, `end_date`,
  `runs_done`, `delivery` (`draft|auto_email`), `active`.

- **invoice_events** (log aktivitas): `invoice_id`, `type` (`created`,
  `edited_after_send`, `sent_email`, `shared_whatsapp`, `link_copied`,
  `viewed`, `payment_claimed`, `claim_rejected`, `marked_paid`, `voided`,
  `duplicated`, `recurring_generated`, `email_failed`), `meta` (jsonb),
  `created_at`.

- **exchange_rates**: `date`, `currency`, `per_eur` (numeric). Konversi antar
  mata uang dihitung silang melalui EUR (format asli kurs ECB).

### Aturan snapshot

Invoice **tidak pernah** dirender dari data klien/profil/rekening yang live.
Setiap kali invoice disimpan, data tersebut disalin ke kolom `*_snapshot`.
Mengubah data klien tidak mengubah invoice lama.

## 5. Status & Siklus Hidup Invoice

```
draft ──(kirim email / salin link / WhatsApp / "Tandai terkirim")──▶ sent
sent ──(klien klik "Saya sudah bayar")──▶ payment_claimed
payment_claimed ──(pengguna konfirmasi)──▶ paid
payment_claimed ──(pengguna tolak)──▶ sent
sent | payment_claimed ──("Tandai lunas" manual)──▶ paid
paid ──("Batalkan lunas")──▶ sent
draft | sent | payment_claimed ──(Void)──▶ void      (permanen)
```

Label tambahan yang **diturunkan**, tidak disimpan sebagai status:
- **Dilihat**: `status = sent` dan `first_viewed_at` terisi.
- **Jatuh tempo**: `status ∈ {sent, payment_claimed}` dan `due_date < hari ini`
  (zona waktu Asia/Jakarta).

### Aturan edit

- **Draft**: bebas diedit & dihapus.
- **Sent / payment_claimed**: boleh diedit (freelancer sering memperbaiki typo).
  Nomor tetap, event `edited_after_send` dicatat, dan link publik menampilkan
  versi terbaru.
- **Paid**: terkunci. Harus "Batalkan lunas" dulu untuk mengedit.
- **Void**: hanya-baca. Tidak bisa dihapus. Bisa diduplikat.

### Penomoran

Format default `{prefix}{tahun}-{urut 3 digit}`, misalnya `INV-2026-001`.
Nomor diberikan saat invoice dibuat, diambil dari `next_invoice_number` di
dalam transaksi DB, dan bisa diedit manual (dengan validasi unik). Urutan
**direset tiap tahun** berdasarkan tahun `issue_date`. Nomor yang terlewat
karena draft dihapus dibiarkan (tanpa pajak, celah nomor tidak bermasalah).

### Perhitungan

```
amount_minor   = round_half_up(quantity_milli × unit_price_minor / 1000)
subtotal_minor = Σ amount_minor
discount_minor = percent: round_half_up(subtotal × value_bp / 10000)
                 fixed:   min(value_minor, subtotal)
total_minor    = subtotal_minor − discount_minor
```

## 6. Layar & Alur

### 6.1 Daftar & onboarding

1. **Daftar**: nama, email, password (min. 8 karakter). Tanpa verifikasi, langsung
   masuk.
2. **Setup cepat** (satu halaman, bisa dilewati): nama bisnis/nama tampil, logo
   (opsional), mata uang utama (default IDR), satu rekening pembayaran.
3. Langsung masuk ke **editor invoice baru**.
4. Dashboard menampilkan checklist (gaya Squarespace) sampai selesai: lengkapi
   profil, tambah rekening, kirim invoice pertama, verifikasi email.

### 6.2 Dashboard / daftar invoice

- **Kartu ringkasan** (dalam `base_currency`, berlabel "≈" jika ada konversi):
  Belum dibayar · Jatuh tempo · Lunas bulan ini.
- **Tab**: Semua · Draft · Belum lunas · Lunas · Void.
- **Tabel**: nomor, klien, tanggal terbit, jatuh tempo ("dalam 5 hari" /
  "telat 3 hari"), jumlah + mata uang, badge status.
- Pencarian berdasarkan nomor atau nama klien.
- Tombol utama **Invoice baru**.
- Aksi baris: buka, duplikat, salin link, unduh PDF.
- Badge "Perlu konfirmasi" bila ada klaim pembayaran yang menunggu.

### 6.3 Editor invoice (inti produk)

Desktop: dua kolom. Kiri form, kanan preview A4 yang diskalakan dan berubah
seketika saat mengetik. Mobile: tab **Isi / Preview**.

Bagian form:
1. **Klien**: combobox pencarian dan "+ Klien baru" (form singkat inline). Memilih
   klien otomatis mengisi mata uang & bahasa default milik klien.
2. **Detail**:
   - Nomor invoice.
   - Tanggal terbit.
   - Jatuh tempo, dengan chip cepat *Saat diterima · 7 · 14 · 30 hari*.
   - Mata uang dan bahasa invoice (ID/EN).
3. **Item**:
   - Kolom nama dengan autocomplete dari katalog, plus qty, satuan, dan harga.
   - Baris bisa di-drag untuk diurutkan.
   - Tekan Enter di baris terakhir untuk menambah baris baru.
   - Ikon "Simpan ke katalog" per baris.
4. **Diskon**: tidak ada, persen, atau nominal.
5. **Rekening pembayaran**: checkbox dari daftar rekening; yang berlabel default
   sudah tercentang.
6. **Catatan**: default dari profil.
7. **Tampilan**: pilih template (3 thumbnail) dan warna aksen. Default dari profil.

Perilaku:
- **Autosave** draft dengan debounce ~1 detik, disertai indikator "Tersimpan".
- Validasi minimal sebelum kirim: ada klien, minimal 1 item, total > 0.
- Tombol header:
  - **Kirim** (dropdown: Email · WhatsApp · Salin link).
  - **Unduh PDF**.
  - Menu ⋯ berisi Duplikat · Jadikan berulang · Tandai terkirim · Void · Hapus
    (khusus draft).

### 6.4 Detail invoice (setelah terkirim)

Preview invoice ditambah panel samping berisi:
- Status.
- Timeline `invoice_events`.
- Klaim pembayaran yang menunggu, lengkap dengan bukti, nama, tanggal, jumlah,
  dan tombol **Konfirmasi lunas / Tolak**.
- Tombol **Tandai lunas** (isi tanggal bayar dan catatan opsional).
- Info jadwal berulang, jika ada.

### 6.5 Halaman publik klien `/i/[token]`

- Tanpa login dan `noindex`. Bahasa mengikuti `invoice.language`.
- Isi halaman:
  - Banner status (Lunas / Jatuh tempo / Menunggu konfirmasi).
  - Dokumen invoice memakai template yang sama.
  - Kartu **Cara pembayaran** dari snapshot rekening, dengan tombol salin nomor
    rekening.
  - Tombol **Unduh PDF** dan **Saya sudah bayar**.
- Form "Saya sudah bayar":
  - Isian: nama, tanggal bayar, jumlah (default total), catatan, dan upload
    bukti (opsional; JPG/PNG/PDF, maks. 5 MB).
  - Setelah dikirim, status berubah ke `payment_claimed` dan pemilik diberi
    tahu (email bila terverifikasi, badge di dashboard).
  - Batas: maksimal 3 klaim `pending` per invoice.
- Kunjungan pertama mengisi `first_viewed_at` dan event `viewed`. Kunjungan
  oleh pemilik yang sedang login tidak dihitung.
- Draft & void: draft → 404; void → halaman "Invoice ini dibatalkan".
- Footer kecil "Dibuat dengan Invoice Maker".

### 6.6 Klien, katalog, rekening, pengaturan

CRUD sederhana dengan arsip, bukan hapus permanen, jika data sudah dipakai
invoice. Halaman klien menampilkan daftar invoice klien itu dan tombol
**Invoice baru untuk klien ini**. Pengaturan berisi:
- Profil bisnis.
- Default invoice: prefix, jatuh tempo, mata uang, bahasa, catatan, template,
  warna.
- Bahasa UI.
- Akun: ganti password, verifikasi email.

## 7. Template Dokumen

Tiga komponen React murni: **Minimal**, **Klasik**, dan **Modern** (header blok
warna aksen). Semuanya menerima props `InvoiceDocument` yang sudah berisi string
siap tampil, yaitu angka terformat dan label dalam bahasa invoice. Props ini
dibangun oleh `build-document.ts` dari snapshot invoice.

- Ukuran A4 (210 × 297 mm) dengan CSS `@page`. Preview editor menskalakan
  dokumen dengan `transform: scale()`.
- Format angka memakai `Intl.NumberFormat` sesuai bahasa invoice. Contoh:
  `Rp5.000.000` (id) dan `IDR 5,000,000` (en); `US$1,250.00` / `$1,250.00`.
- Format tanggal: `21 Oktober 2026` (id) dan `October 21, 2026` (en).
- Isi dokumen:
  - Logo, info bisnis, "Ditagihkan kepada" (klien), nomor, tanggal terbit, dan
    jatuh tempo.
  - Tabel item, subtotal, diskon, dan total.
  - Cara pembayaran, catatan, dan label "LUNAS" bila sudah dibayar.

## 8. PDF

`GET /api/invoices/[id]/pdf` (pemilik) dan `GET /i/[token]/pdf` (publik) bekerja
sebagai berikut:
1. Buat URL `/print/[id]?exp=…&sig=…` yang ditandatangani HMAC (`PRINT_SECRET`)
   dan berlaku 60 detik.
2. Chromium headless membuka URL tersebut lalu `page.pdf({ format: 'A4',
   printBackground: true })`.
3. Kirim PDF dengan nama file `INV-2026-001.pdf`.

PDF tidak di-cache di MVP; selalu dibuat ulang dari data terbaru. Batas waktu
fungsi 30 detik. Bila gagal, tampilkan toast error dengan tombol coba lagi.
Lokal/dev memakai Chromium yang terpasang (`CHROMIUM_PATH`).

## 9. Pengiriman

- **Email**:
  - Hanya untuk pengguna dengan `email_verified = true`. Bila belum, tombol
    membuka dialog "Verifikasi email untuk mengirim dari aplikasi" yang mengirim
    link verifikasi.
  - Pengirim `"{Nama Bisnis}" <invoice@{DOMAIN}>`, `reply-to` = email
    pengguna. Penerima: email klien (bisa diedit, plus CC).
  - Subjek dan isi default dalam bahasa invoice dan bisa diedit. Email berisi
    tombol "Lihat invoice" ke link publik dan lampiran PDF.
  - Batas 50 email/hari per pengguna. Bila gagal: status tidak berubah, event
    `email_failed`, dan error ditampilkan.
- **WhatsApp**:
  - Membuka `https://wa.me/{nomor}?text=…` dengan pesan template dalam bahasa
    invoice plus link publik.
  - Nomor dinormalisasi (`08…` → `628…`, hapus spasi/tanda). Tanpa nomor →
    `https://wa.me/?text=…`.
- **Salin link**: menyalin `/i/[token]`.

Aksi Email, WhatsApp, dan Salin link pada draft otomatis mengubah status menjadi
`sent`. Unduh PDF **tidak** mengubah status (supaya bisa dicek dulu); tersedia
"Tandai terkirim" untuk kasus kirim PDF manual.

## 10. Invoice Berulang

- Dari menu invoice: **Jadikan berulang**.
- Pengaturan jadwal:
  - Frekuensi (mingguan/bulanan/tahunan, setiap N) dan tanggal invoice
    berikutnya.
  - Berakhir: tidak pernah, setelah N kali, atau pada tanggal tertentu.
  - Pengiriman: **buat draft & beri tahu saya** (default) atau **kirim email
    otomatis**. Opsi kedua butuh email terverifikasi dan klien punya email.
- Cron harian pukul 07.00 WIB (00:00 UTC) memproses semua jadwal aktif dengan
  `next_run_on ≤ hari ini`. Untuk setiap jadwal:
  1. Salin item dan pengaturan dari invoice sumber.
  2. Beri nomor baru, `issue_date` = tanggal jalan, dan `due_date` = tanggal
     jalan + selisih hari yang sama seperti di invoice sumber.
  3. Majukan `next_run_on`.
- Bulanan pada tanggal 29–31 jatuh ke hari terakhir bulan bila bulan itu lebih
  pendek.
- Idempoten: constraint unik `(recurring_schedule_id, issue_date)` pada
  invoice hasil.
- Kegagalan per jadwal dicatat dan tidak menghentikan jadwal lain.

## 11. Mata Uang & Kurs

- Mata uang yang didukung mengikuti daftar Frankfurter (termasuk IDR, USD, SGD,
  EUR, AUD, GBP, MYR, JPY).
- Cron harian mengambil `latest` dan menyimpannya di `exchange_rates`.
- Saat invoice disimpan, `fx_rate_to_base` diisi dari kurs pada atau sebelum
  `issue_date`. Jika belum ada data kurs, dipakai kurs terbaru beserta
  `fx_rate_date`-nya.
- Kurs **hanya untuk ringkasan dashboard**. Dokumen invoice selalu dalam mata
  uang aslinya. Angka hasil konversi diberi label "≈" dan tooltip tanggal kurs.

## 12. Keamanan & Penanganan Error

- Otorisasi: semua server action/route memakai `requireUser()` dan filter
  `user_id`. Akses ke ID milik orang lain menghasilkan 404.
- `public_token` acak 128-bit. Halaman cetak hanya bisa dibuka dengan tanda
  tangan HMAC yang masih berlaku.
- Upload: whitelist MIME (JPG/PNG/WebP untuk logo; JPG/PNG/PDF untuk bukti),
  ukuran maks. 2 MB (logo) / 5 MB (bukti).
- Rate limit sederhana berbasis DB: login gagal, email per hari, klaim pending
  per invoice.
- Cron route menolak request tanpa header `Authorization: Bearer CRON_SECRET`.
- Error yang tampil ke pengguna memakai bahasa UI. Error server dicatat dengan
  konteks (user id, invoice id) tanpa data sensitif.

## 13. Pengujian

- **Unit (Vitest)**:
  - `money` (pembulatan, format per locale & mata uang).
  - `invoice-calc` (diskon persen/nominal, kuantitas desimal).
  - `numbering` (reset tahunan, unik).
  - `recurring` (akhir bulan, interval, kondisi berakhir).
  - `fx` (konversi silang lewat EUR, fallback tanggal).
  - `whatsapp` (normalisasi nomor).
  - `build-document` (label ID/EN).
- **Integrasi**: transisi status & aturan edit pada DB test (branch Neon atau
  Postgres lokal).
- **E2E (Playwright)**:
  1. Daftar → setup → buat invoice → salin link → buka sebagai klien → "Saya
     sudah bayar" → konfirmasi lunas.
  2. Duplikat invoice.
  3. Unduh PDF (cek header `application/pdf` dan jumlah halaman ≥ 1).
  4. Ganti bahasa UI.

## 14. Konfigurasi & Prasyarat

Variabel lingkungan:
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
- `RESEND_API_KEY`, `EMAIL_FROM_DOMAIN`
- `BLOB_READ_WRITE_TOKEN`
- `PRINT_SECRET`, `CRON_SECRET`
- `CHROMIUM_PATH` (lokal)

Yang perlu disiapkan pemilik produk:
- Domain untuk pengiriman email yang diverifikasi di Resend (selama belum ada,
  fitur email dinonaktifkan dan fitur lain tetap berjalan).
- Proyek Neon.
- Proyek Vercel.

## 15. Urutan Pembangunan (untuk rencana implementasi)

1. **Fondasi**: scaffold Next.js, Tailwind/shadcn, Drizzle + Neon, Better Auth,
   next-intl, layout aplikasi.
2. **Data master**: profil bisnis + onboarding, rekening, klien, katalog.
3. **Editor & template**: kalkulasi, penomoran, editor + autosave, 3 template,
   preview live, duplikat.
4. **Siklus invoice**: dashboard, status, halaman publik, klaim pembayaran,
   tandai lunas, void, event log.
5. **Output**: PDF via Chromium, email Resend + verifikasi, WhatsApp.
6. **Otomasi**: kurs harian + ringkasan base currency, invoice berulang.

Setiap fase menghasilkan aplikasi yang bisa dijalankan dan diuji sendiri.
