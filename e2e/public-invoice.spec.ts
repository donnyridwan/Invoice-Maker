import { expect, test, type Browser } from "@playwright/test";
import { createInvoiceDraft, markSentViaDb, publicTokenViaDb, setStatusViaDb } from "./helpers";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** A browser context without any login: the client. */
async function newClient(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL, permissions: ["clipboard-read", "clipboard-write"] });
  return { context, page: await context.newPage() };
}

test.describe("public invoice page", () => {
  test("shows the invoice to a client without login, then takes a payment claim", async ({ page, browser, baseURL }) => {
    const id = await createInvoiceDraft(page);
    const token = await markSentViaDb(id);

    const client = await newClient(browser, baseURL);
    const view = client.page;
    await view.goto(`/i/${token}`);

    await expect(view.getByRole("heading", { level: 1 })).toContainText("meminta pembayaran");
    await expect(view.getByRole("heading", { level: 1 })).toContainText(/Rp\s1\.500\.000/);
    await expect(view.locator("meta[name=robots]")).toHaveAttribute("content", /noindex/);
    await expect(view).toHaveTitle(/^Invoice INV-\d{4}-\d{3} — /);
    await expect(view.getByRole("navigation", { name: "Menu utama" })).toHaveCount(0);
    await expect(view.getByRole("link", { name: "Unduh PDF" })).toBeVisible();
    await expect(view.getByText("Dibuat dengan Invoice Maker")).toBeVisible();
    await expect(view.getByRole("article")).toContainText("Desain logo");

    const methods = view.getByRole("region", { name: "Cara pembayaran" });
    await expect(methods).toContainText("BCA");
    await expect(methods).toContainText("1234567890");
    await methods.getByRole("button", { name: /Salin/ }).first().click();
    await expect(view.getByText("Disalin")).toBeVisible();
    expect(await view.evaluate(() => navigator.clipboard.readText())).toBe("1234567890");

    await view.getByRole("button", { name: "Saya sudah bayar" }).click();
    const dialog = view.getByRole("dialog");
    await expect(dialog.getByLabel("Jumlah dibayar")).toHaveValue("1.500.000");
    await dialog.getByLabel("Nama pembayar").fill("Budi");
    await dialog.getByLabel("Bukti transfer").setInputFiles({ name: "bukti.png", mimeType: "image/png", buffer: PNG_1X1 });
    await dialog.getByRole("button", { name: "Kirim" }).click();
    await expect(dialog.getByText("Terima kasih")).toBeVisible();
    await dialog.getByRole("button", { name: "Tutup" }).first().click();

    await view.reload();
    await expect(view.getByText("Menunggu konfirmasi").first()).toBeVisible();

    await client.context.close();
  });

  test("validates the claim form and a non-image proof", async ({ page, browser, baseURL }) => {
    const token = await markSentViaDb(await createInvoiceDraft(page));
    const client = await newClient(browser, baseURL);
    const view = client.page;
    await view.goto(`/i/${token}`);

    await view.getByRole("button", { name: "Saya sudah bayar" }).click();
    const dialog = view.getByRole("dialog");
    await dialog.getByRole("button", { name: "Kirim" }).click();
    await expect(dialog.getByText("Wajib diisi.")).toBeVisible();

    await dialog.getByLabel("Nama pembayar").fill("Budi");
    await dialog.getByLabel("Bukti transfer").setInputFiles({
      name: "evil.png",
      mimeType: "image/png",
      buffer: Buffer.from("<html><script>1</script></html>"),
    });
    await dialog.getByRole("button", { name: "Kirim" }).click();
    await expect(dialog.getByText("Format file tidak didukung")).toBeVisible();
    await expect(dialog.getByText("Terima kasih")).toHaveCount(0);

    await client.context.close();
  });

  test("rejects an oversized proof in the browser and lets the client fix it", async ({ page, browser, baseURL }) => {
    const token = await markSentViaDb(await createInvoiceDraft(page));
    const client = await newClient(browser, baseURL);
    const view = client.page;
    await view.goto(`/i/${token}`);

    await view.getByRole("button", { name: "Saya sudah bayar" }).click();
    const dialog = view.getByRole("dialog");
    await dialog.getByLabel("Nama pembayar").fill("Budi");
    // 6.5 MB: above both the 5 MB proof limit and the 6 MB server-action body limit.
    const big = Buffer.alloc(6.5 * 1024 * 1024);
    PNG_1X1.copy(big);
    await dialog.getByLabel("Bukti transfer").setInputFiles({ name: "besar.png", mimeType: "image/png", buffer: big });
    await dialog.getByRole("button", { name: "Kirim" }).click();
    await expect(dialog.getByText("Ukuran file terlalu besar")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Kirim" })).toBeEnabled();
    await expect(dialog.getByText("Terima kasih")).toHaveCount(0);

    await dialog.getByLabel("Bukti transfer").setInputFiles({ name: "catatan.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
    await dialog.getByRole("button", { name: "Kirim" }).click();
    await expect(dialog.getByText("Format file tidak didukung")).toBeVisible();

    await dialog.getByLabel("Bukti transfer").setInputFiles({ name: "bukti.png", mimeType: "image/png", buffer: PNG_1X1 });
    await dialog.getByRole("button", { name: "Kirim" }).click();
    await expect(dialog.getByText("Terima kasih")).toBeVisible();

    await client.context.close();
  });

  test("renders in the language of the invoice", async ({ page, browser, baseURL }) => {
    const token = await markSentViaDb(await createInvoiceDraft(page, { english: true }));
    const client = await newClient(browser, baseURL);
    const view = client.page;
    await view.goto(`/i/${token}`);

    await expect(view.getByRole("heading", { level: 1 })).toContainText("requested a payment");
    await expect(view.getByRole("button", { name: "I've paid" })).toBeVisible();
    await expect(view.getByRole("region", { name: "How to pay" })).toBeVisible();
    await expect(view.getByText("Created with Invoice Maker")).toBeVisible();

    await client.context.close();
  });

  test("shows paid and void invoices without the claim button", async ({ page, browser, baseURL }) => {
    const id = await createInvoiceDraft(page);
    const token = await markSentViaDb(id);
    const client = await newClient(browser, baseURL);
    const view = client.page;

    await setStatusViaDb(id, "paid");
    await view.goto(`/i/${token}`);
    await expect(view.getByText("Lunas").first()).toBeVisible();
    await expect(view.getByRole("button", { name: "Saya sudah bayar" })).toHaveCount(0);

    await setStatusViaDb(id, "void");
    await view.reload();
    await expect(view.getByText("Invoice ini dibatalkan")).toBeVisible();
    await expect(view.getByRole("button", { name: "Saya sudah bayar" })).toHaveCount(0);

    await client.context.close();
  });

  test("answers 404 for a draft and for an unknown token", async ({ page, browser, baseURL }) => {
    const id = await createInvoiceDraft(page);
    const token = await publicTokenViaDb(id);
    const client = await newClient(browser, baseURL);

    const draft = await client.page.goto(`/i/${token}`);
    expect(draft?.status()).toBe(404);
    await expect(client.page.getByText("Invoice tidak ditemukan")).toBeVisible();

    const unknown = await client.page.goto("/i/does-not-exist");
    expect(unknown?.status()).toBe(404);

    await client.context.close();
  });
});
