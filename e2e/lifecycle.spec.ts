import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  createInvoiceDraft,
  createInvoiceViaUi,
  markSentViaDb,
  registerUser,
  setDueDateViaDb,
} from "./helpers";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/** A browser context without any login: the client. */
async function newClient(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL });
  return { context, page: await context.newPage() };
}

function statusCard(page: Page) {
  return page.getByRole("region", { name: "Status invoice" });
}

/** The client reports a payment from the public page. */
async function submitClaim(browser: Browser, baseURL: string | undefined, token: string, payer: string) {
  const client = await newClient(browser, baseURL);
  const view = client.page;
  await view.goto(`/i/${token}`);
  await view.getByRole("button", { name: "Saya sudah bayar" }).click();
  const dialog = view.getByRole("dialog");
  await dialog.getByLabel("Nama pembayar").fill(payer);
  await dialog.getByLabel("Bukti transfer").setInputFiles({ name: "bukti.png", mimeType: "image/png", buffer: PNG_1X1 });
  await dialog.getByRole("button", { name: "Kirim" }).click();
  await expect(dialog.getByText("Terima kasih")).toBeVisible();
  await client.context.close();
}

test.describe("invoice lifecycle", () => {
  test("sends from the editor, logs the activity and shows when the client viewed it", async ({ page, browser, baseURL }) => {
    const id = await createInvoiceDraft(page);
    const titleRow = page.getByRole("heading", { level: 1, name: /^INV-/ }).locator("..");
    await expect(titleRow).toContainText("Draft");

    await page.getByRole("button", { name: "Kirim", exact: true }).click();
    await page.getByRole("menuitem", { name: "Salin link" }).click();
    await expect(page.getByText("Link disalin", { exact: true })).toBeVisible();
    await expect(titleRow).toContainText("Terkirim");

    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(new RegExp(`^${baseURL}/i/[\\w-]{20,}$`));

    await page.getByRole("link", { name: "Lihat", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/invoices/${id}$`));
    await expect(statusCard(page)).toContainText("Terkirim");
    await expect(statusCard(page)).toContainText(/Rp\s1\.500\.000/);
    await expect(statusCard(page)).toContainText("dalam 14 hari");
    const activity = page.getByRole("region", { name: "Aktivitas" });
    await expect(activity).toContainText("Link disalin");
    await expect(activity).toContainText("Invoice dibuat");
    await expect(page.getByRole("article")).toContainText("Desain logo");

    const client = await newClient(browser, baseURL);
    await client.page.goto(link);
    await expect(client.page.getByRole("heading", { level: 1 })).toContainText("meminta pembayaran");
    await client.context.close();

    await page.reload();
    await expect(statusCard(page)).toContainText("Dilihat");
    await expect(activity).toContainText("Dilihat klien");
  });

  test("refuses to send an invoice without a client", async ({ page }) => {
    await registerUser(page);
    await createInvoiceViaUi(page);
    await page.getByRole("button", { name: "Kirim", exact: true }).click();
    await page.getByRole("menuitem", { name: "Salin link" }).click();
    await expect(page.getByText("Pilih klien terlebih dahulu")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /^INV-/ }).locator("..")).toContainText("Draft");
    await expect(page.getByRole("link", { name: "Lihat", exact: true })).toHaveCount(0);
  });

  test("marks a sent invoice as sent by hand, then confirms a client claim and takes it back", async ({ page, browser, baseURL }) => {
    const id = await createInvoiceDraft(page);
    await page.getByRole("button", { name: "Kirim", exact: true }).click();
    await page.getByRole("menuitem", { name: "Tandai terkirim" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^INV-/ }).locator("..")).toContainText("Terkirim");

    await page.getByRole("link", { name: "Lihat", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/invoices/${id}$`));
    await expect(page.getByRole("region", { name: "Aktivitas" })).toContainText("Ditandai terkirim");
    await expect(page.getByRole("region", { name: "Klaim pembayaran" })).toHaveCount(0);

    // The client reports a payment (Budi).
    const publicLink = await page.getByRole("link", { name: "Lihat halaman klien" }).getAttribute("href");
    await submitClaim(browser, baseURL, publicLink!.split("/i/")[1], "Budi");

    await page.reload();
    await expect(statusCard(page)).toContainText("Menunggu konfirmasi");
    const claims = page.getByRole("region", { name: "Klaim pembayaran" });
    await expect(claims).toContainText("Budi");
    await expect(claims).toContainText(/Rp\s1\.500\.000/);
    const proof = claims.getByRole("link", { name: "Lihat bukti" });
    await expect(proof).toHaveAttribute("target", "_blank");
    await expect(proof).toHaveAttribute("href", /^\/uploads\/payment-proof\/.+\.png$/);
    await expect(page.getByRole("region", { name: "Aktivitas" })).toContainText("Budi melaporkan pembayaran");

    await claims.getByRole("button", { name: "Konfirmasi lunas" }).click();
    await expect(statusCard(page)).toContainText("Lunas");
    await expect(page.getByRole("region", { name: "Klaim pembayaran" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Void", exact: true })).toHaveCount(0);

    await page.goto(`/invoices/${id}/edit`);
    await expect(page).toHaveURL(new RegExp(`/invoices/${id}$`));

    // The client has opened the link by now, so the unpaid invoice reads "Dilihat".
    await page.getByRole("button", { name: "Batalkan lunas" }).click();
    await expect(statusCard(page)).toContainText("Dilihat");
    await expect(page.getByRole("button", { name: "Tandai lunas" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Aktivitas" })).toContainText("Lunas dibatalkan");
  });

  test("rejects a claim and returns the invoice to sent", async ({ page, browser, baseURL }) => {
    const id = await createInvoiceDraft(page);
    const token = await markSentViaDb(id);
    await submitClaim(browser, baseURL, token, "Siti");

    await page.goto(`/invoices/${id}`);
    await expect(statusCard(page)).toContainText("Menunggu konfirmasi");
    await page.getByRole("region", { name: "Klaim pembayaran" }).getByRole("button", { name: "Tolak" }).click();
    // Back to sent; the client has opened the link, so the label is "Dilihat".
    await expect(statusCard(page)).toContainText("Dilihat");
    await expect(page.getByRole("region", { name: "Klaim pembayaran" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Aktivitas" })).toContainText("Klaim pembayaran ditolak");
  });

  test("marks an invoice paid by hand from the dialog", async ({ page }) => {
    const id = await createInvoiceDraft(page);
    await markSentViaDb(id);
    await page.goto(`/invoices/${id}`);

    await page.getByRole("button", { name: "Tandai lunas" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Tanggal bayar")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await dialog.getByLabel("Catatan").fill("Transfer BCA");
    await dialog.getByRole("button", { name: "Simpan" }).click();

    await expect(statusCard(page)).toContainText("Lunas");
    await expect(statusCard(page)).toContainText("Transfer BCA");

    // Nobody opened the link, so undoing the payment goes back to plain "Terkirim".
    await page.getByRole("button", { name: "Batalkan lunas" }).click();
    await expect(statusCard(page)).toContainText("Terkirim");
    await expect(page.getByRole("button", { name: "Tandai lunas" })).toBeVisible();
  });

  test("voids an invoice after a red confirmation and the public page says it was cancelled", async ({ page, browser, baseURL }) => {
    const id = await createInvoiceDraft(page);
    const token = await markSentViaDb(id);
    await page.goto(`/invoices/${id}`);

    await page.getByRole("button", { name: "Void", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Void invoice ini?");
    const confirm = dialog.getByRole("button", { name: "Void invoice" });
    await expect(confirm).toHaveClass(/bg-danger/);
    await confirm.click();

    await expect(statusCard(page)).toContainText("Void");
    await expect(page.getByRole("link", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Aktivitas" })).toContainText("Invoice di-void");
    await page.goto(`/invoices/${id}/edit`);
    await expect(page).toHaveURL(new RegExp(`/invoices/${id}$`));

    const client = await newClient(browser, baseURL);
    await client.page.goto(`/i/${token}`);
    await expect(client.page.getByText("dibatalkan").first()).toBeVisible();
    await client.context.close();
  });

  test("duplicates a sent invoice into a new draft and opens rows by status in the list", async ({ page }) => {
    const id = await createInvoiceDraft(page);
    await markSentViaDb(id);
    await page.goto(`/invoices/${id}`);
    await page.getByRole("button", { name: "Duplikat" }).click();
    await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}\/edit$/);
    await expect(page.getByRole("heading", { level: 1, name: /^INV-/ })).toHaveText(/-003$/);

    await page.goto("/invoices");
    // Sent -> detail, draft -> editor.
    await page.getByRole("row").filter({ hasText: "Terkirim" }).getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/invoices/${id}$`));
  });
});

function plusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's date in Jakarta, as the server sees it. */
function todayInJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

test.describe("dashboard", () => {
  test("shows the unpaid total, ticks the first-invoice step and lists the invoice under its tab", async ({ page }) => {
    const id = await createInvoiceDraft(page);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Halo, Donny" })).toBeVisible();
    const step = page.getByRole("listitem").filter({ hasText: "Kirim invoice pertama" });
    await expect(step).toHaveAttribute("data-done", "false");
    const unpaid = page.getByRole("link", { name: /Belum dibayar/ });
    await expect(unpaid).toContainText("Rp 0");

    await markSentViaDb(id);
    await page.goto("/dashboard");
    await expect(unpaid).toContainText(/Rp\s1\.500\.000/);
    await expect(unpaid).toContainText("1 invoice");
    await expect(page.getByRole("link", { name: /Lunas bulan ini/ })).toContainText("Rp 0");
    await expect(step).toHaveAttribute("data-done", "true");
    await expect(page.getByRole("region", { name: "Invoice terbaru" })).toContainText(/INV-\d{4}-002/);

    await page.goto("/invoices");
    await expect(page.getByRole("link", { name: /^Semua\s*2$/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Draft\s*1$/ })).toBeVisible();
    await page.getByRole("link", { name: /^Belum lunas\s*1$/ }).click();
    await expect(page).toHaveURL(/tab=unpaid/);
    await expect(page.getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("row").nth(1)).toContainText("Terkirim");
    await page.getByRole("link", { name: /^Draft/ }).click();
    await expect(page.getByRole("row").nth(1)).toContainText("Draft");
    await expect(page.getByRole("row")).toHaveCount(2);
  });

  test("flags overdue invoices and waiting payment claims, and hides the checklist once it is complete", async ({ page, browser, baseURL }) => {
    const id = await createInvoiceDraft(page);
    const token = await markSentViaDb(id);
    await setDueDateViaDb(id, plusDays(todayInJakarta(), -3));
    await submitClaim(browser, baseURL, token, "Budi");

    await page.goto("/dashboard");
    await expect(page.getByText("1 pembayaran menunggu konfirmasi")).toBeVisible();
    await expect(page.getByRole("link", { name: /Jatuh tempo/ }).first()).toContainText(/Rp\s1\.500\.000/);

    await page.goto("/invoices?tab=unpaid");
    const row = page.getByRole("row").nth(1);
    await expect(row).toContainText("Perlu konfirmasi");
    await expect(row.getByText("telat 3 hari")).toHaveClass(/text-danger/);
    await expect(row).toContainText("Jatuh tempo");

    // Profile (address) was the only open step besides the sent invoice, which is done now.
    await page.goto("/settings");
    const profileCard = page.getByRole("region", { name: "Profil bisnis" });
    await profileCard.getByLabel("Alamat").fill("Jl. Sudirman No. 1, Jakarta");
    await profileCard.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Tersimpan")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByRole("region", { name: "Mulai menggunakan Invoice Maker" })).toHaveCount(0);
  });
});
