import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  createInvoiceDraft,
  createInvoiceViaUi,
  markSentViaDb,
  registerUser,
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
