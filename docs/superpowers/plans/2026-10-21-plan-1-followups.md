# Plan 1: Tindak Lanjut

Plan 1 (Fondasi & Data Master) selesai di commit `daaa1b8`. Review akhir
menyatakannya **Ready**. Catatan di bawah adalah temuan minor yang sengaja
ditunda, ditulis ulang di sini agar tidak hilang.

## Masukkan ke task pertama Plan 2

- **R1, logout lewat link.** Membuka `/login?expired=1` saat sesi masih valid
  langsung mengeluarkan pengguna (`login-form.tsx`).
  - Perbaikan: hanya kirim flag `expired` ke form bila `getOptionalUser()`
    di server mengembalikan `null`.
- **R2, prefix `Rp.` ditolak.** `Rp. 1.500.000` dan `Rp.1.500.000` tidak
  diterima (`src/lib/money.ts`). Input ditolak, tidak salah dibaca.
  - Perbaikan: izinkan titik opsional setelah `Rp` di `CURRENCY_PREFIX`.
- **R3, path bertitik melewati proxy.** Path yang mengandung titik lolos dari
  matcher proxy.
  - Jangan pakai nomor invoice (`INV-2026.001`) di URL. Gunakan UUID.
- **R5, versi Node di README.** README menyebut "Node.js 20+"; samakan dengan
  Node 22.

## Sebelum peluncuran (hardening keamanan & operasional)

- **M7, rate limit belum tahan di serverless.** Rate limit Better Auth masih
  in-memory sehingga tidak efektif di Vercel.
  - Pakai `rateLimit: { storage: "database" }` beserta migrasinya.
  - Tampilkan pesan khusus untuk respons 429.
- **M11, onboarding tidak atomik.** `finishOnboardingAction` menyimpan profil
  dan rekening tanpa transaksi.
- **M13, log error tanpa konteks.** Tambahkan konteks `userId` dan ID entitas,
  tanpa data sensitif.
- **M14, error mentah dari input rekayasa.** Input yang sengaja dibuat aneh
  bisa menghasilkan error yang tidak diterjemahkan.
- **M15, race condition.** Pembacaan profil bisa balapan dengan self-heal di
  layout.

## Kosmetik

- **R4, error generik pada "jadikan default".** Dua permintaan bersamaan
  menampilkan error umum. Data tetap benar karena dijaga unique index.
- **R6, sisa duplikasi kecil** dari temuan M12.
