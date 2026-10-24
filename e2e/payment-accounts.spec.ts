import { expect, test } from "@playwright/test";
import { registerUser } from "./helpers";

test.describe("payment accounts", () => {
  test("adds, archives and restores a bank account", async ({ page }) => {
    await registerUser(page);
    await page.goto("/settings/payment-accounts");

    await expect(page.getByText("Belum ada rekening pembayaran")).toBeVisible();

    await page.getByRole("button", { name: "Tambah rekening" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nama bank").fill("BCA");
    await dialog.getByLabel("Nama pemilik rekening").fill("Donny");
    await dialog.getByLabel("Nomor rekening").fill("1234567890");
    await dialog.getByLabel("Jadikan default").check();
    await dialog.getByRole("button", { name: "Simpan" }).click();

    const card = page.getByRole("listitem").filter({ hasText: "BCA" });
    await expect(card).toContainText("Donny · •••• 7890");
    await expect(card).toContainText("Default");

    await card.getByRole("button", { name: "Aksi" }).click();
    await page.getByRole("menuitem", { name: "Arsipkan" }).click();
    await expect(page.getByText("Belum ada rekening pembayaran")).toBeVisible();

    await page.getByLabel("Tampilkan arsip").check();
    await expect(card).toContainText("Diarsipkan");
    await card.getByRole("button", { name: "Aksi" }).click();
    await page.getByRole("menuitem", { name: "Pulihkan" }).click();
    // Nothing is archived any more, so the toggle goes away and the card is active again.
    await expect(page.getByLabel("Tampilkan arsip")).toHaveCount(0);
    await expect(card).not.toContainText("Diarsipkan");
  });

  test("adds a custom method with its own detail rows", async ({ page }) => {
    await registerUser(page);
    await page.goto("/settings/payment-accounts");

    await page.getByRole("button", { name: "Tambah rekening" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Jenis").click();
    await page.getByRole("option", { name: "Lainnya" }).click();
    await dialog.getByLabel("Nama metode").fill("GoPay");
    await dialog.getByLabel("Nama detail 1").fill("Nomor HP");
    await dialog.getByRole("button", { name: "Tambah detail" }).click();
    await dialog.getByLabel("Nama detail 2").fill("Atas nama");
    await dialog.getByRole("button", { name: "Simpan" }).click();
    // A row without its value is flagged.
    await expect(dialog.getByText("Wajib diisi").first()).toBeVisible();

    await dialog.getByLabel("Isi detail 1").fill("0812 3456 7890");
    await dialog.getByLabel("Isi detail 2").fill("Donny");
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(dialog).toHaveCount(0);

    const card = page.getByRole("listitem").filter({ hasText: "GoPay" });
    await expect(card).toContainText("Nomor HP: 0812 3456 7890");
  });

  test("shows field errors for an incomplete SWIFT account", async ({ page }) => {
    await registerUser(page);
    await page.goto("/settings/payment-accounts");

    await page.getByRole("button", { name: "Tambah rekening" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Jenis").click();
    await page.getByRole("option", { name: "SWIFT" }).click();
    await dialog.getByLabel("Nama bank").fill("DBS");
    await dialog.getByLabel("Nama pemilik rekening").fill("Donny");
    await dialog.getByLabel("Kode SWIFT/BIC").fill("DBSSSGSG");
    await dialog.getByRole("button", { name: "Simpan" }).click();

    await expect(dialog.getByText("Isi nomor rekening atau IBAN.")).toBeVisible();
  });
});
