import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createInvoiceDraft, markSentViaDb, publicTokenViaDb, registerUser, setStatusViaDb } from "./helpers";

/** Signs `/print/<id>` like the app does (same secret: playwright.config.ts passes it to the server). */
function signedPrintPath(id: string, expSeconds: number): string {
  const secret = process.env.PRINT_SECRET;
  if (!secret) throw new Error("PRINT_SECRET is not set for the e2e run");
  const sig = createHmac("sha256", secret).update(`${id}.${expSeconds}`).digest("hex");
  return `/print/${id}?exp=${expSeconds}&sig=${sig}`;
}

function hasPdftotext(): boolean {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

test.describe("owner pdf", () => {
  test("downloads the invoice as a PDF without changing its status", async ({ page }) => {
    const id = await createInvoiceDraft(page);

    const response = await page.request.get(`/api/invoices/${id}/pdf`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    expect(response.headers()["content-disposition"]).toMatch(/^attachment; filename="INV-[A-Za-z0-9._-]+\.pdf"$/);
    const body = await response.body();
    expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(body.toString("latin1")).toContain("/Type /Page");

    // Still a draft: opening the detail URL sends it back to the editor.
    await page.goto(`/invoices/${id}`);
    await expect(page).toHaveURL(new RegExp(`/invoices/${id}/edit$`));
  });

  test("has an Unduh PDF link in the editor header and on the detail page", async ({ page }) => {
    const id = await createInvoiceDraft(page);
    const editorLink = page.getByRole("link", { name: "Unduh PDF" });
    await expect(editorLink).toHaveAttribute("href", `/api/invoices/${id}/pdf`);
    await expect(editorLink).toHaveAttribute("download", "");

    await markSentViaDb(id);
    await page.goto(`/invoices/${id}`);
    const detailLink = page.getByRole("link", { name: "Unduh PDF" });
    await expect(detailLink).toHaveAttribute("href", `/api/invoices/${id}/pdf`);

    const [download] = await Promise.all([page.waitForEvent("download"), detailLink.click()]);
    expect(download.suggestedFilename()).toMatch(/^INV-[A-Za-z0-9._-]+\.pdf$/);
  });

  test("flushes a pending edit before downloading, so the PDF has it", async ({ page }, testInfo) => {
    test.skip(!hasPdftotext(), "pdftotext (poppler-utils) is needed to read the PDF text");
    await createInvoiceDraft(page);

    // Edit and click straight away: the 1 s autosave debounce has not fired yet.
    await page.getByRole("group", { name: "Item 1" }).getByLabel("Nama item").fill("Revisi mendadak");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Unduh PDF" }).click(),
    ]);
    const file = testInfo.outputPath("invoice.pdf");
    await download.saveAs(file);

    const text = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
    expect(text).toContain("Revisi mendadak");
    expect(text).not.toContain("Desain logo");
  });

  test("needs a session", async ({ request }) => {
    const response = await request.get("/api/invoices/3f2c1a9e-6b1d-4c53-9a8e-2d7f0b1c4e55/pdf", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toContain("/login");
  });

  test("is a 404 for another user's invoice", async ({ page, browser, baseURL }) => {
    const id = await createInvoiceDraft(page);

    const context = await browser.newContext({ baseURL });
    const other = await context.newPage();
    await registerUser(other);
    expect((await other.request.get(`/api/invoices/${id}/pdf`)).status()).toBe(404);
    expect((await other.request.get("/api/invoices/not-a-uuid/pdf")).status()).toBe(404);
    await context.close();
  });
});

test.describe("print page", () => {
  test("is a 404 without a valid signature, expired, or for another invoice", async ({ page, request }) => {
    const id = await createInvoiceDraft(page);
    const otherId = "3f2c1a9e-6b1d-4c53-9a8e-2d7f0b1c4e55";

    expect((await request.get(`/print/${id}`)).status()).toBe(404);
    expect((await request.get(`/print/${id}?exp=${nowSeconds() + 60}&sig=${"0".repeat(64)}`)).status()).toBe(404);
    // Signed a minute ago, so it has just expired.
    expect((await request.get(signedPrintPath(id, nowSeconds() - 1))).status()).toBe(404);
    // A good signature for one id does not open another.
    const signed = signedPrintPath(id, nowSeconds() + 60);
    expect((await request.get(signed.replace(id, otherId))).status()).toBe(404);
  });

  test("renders only the document for a valid signature, without the app shell, and is noindex", async ({ page, request }) => {
    const id = await createInvoiceDraft(page);
    const response = await request.get(signedPrintPath(id, nowSeconds() + 60));
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain("Desain logo");
    expect(html).toMatch(/<meta name="robots" content="noindex/);
    expect(html).not.toContain(`aria-label="Menu utama"`);
    expect(html).toContain("@page { size: A4; margin: 0 }");
  });
});

test.describe("public pdf", () => {
  test("serves a sent invoice to anyone with the link, and records nothing", async ({ page, request }) => {
    const id = await createInvoiceDraft(page);
    const token = await markSentViaDb(id);

    const response = await request.get(`/i/${token}/pdf`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/pdf");
    expect(response.headers()["content-disposition"]).toMatch(/filename="INV-[A-Za-z0-9._-]+\.pdf"/);
    expect((await response.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // Neither a view nor a status change: the owner's timeline has no "Dilihat klien".
    await page.goto(`/invoices/${id}`);
    await expect(page.getByRole("region", { name: "Aktivitas" })).not.toContainText("Dilihat klien");
    await expect(page.getByRole("region", { name: "Aktivitas" })).toContainText("Invoice dibuat");
  });

  test("serves a paid invoice too, but a void one, a draft and an unknown token are 404", async ({ page, request }) => {
    const id = await createInvoiceDraft(page);
    const token = await publicTokenViaDb(id);

    expect((await request.get(`/i/${token}/pdf`)).status()).toBe(404); // still a draft
    expect((await request.get("/i/does-not-exist-token/pdf")).status()).toBe(404);

    await setStatusViaDb(id, "paid");
    expect((await request.get(`/i/${token}/pdf`)).status()).toBe(200);

    await setStatusViaDb(id, "void");
    expect((await request.get(`/i/${token}/pdf`)).status()).toBe(404);
  });

  test("shows the Unduh PDF button on the public page", async ({ page, browser, baseURL }) => {
    const token = await markSentViaDb(await createInvoiceDraft(page));
    const context = await browser.newContext({ baseURL });
    const view = await context.newPage();
    await view.goto(`/i/${token}`);

    const link = view.getByRole("link", { name: "Unduh PDF" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", `/i/${token}/pdf`);
    await expect(link).toHaveAttribute("download", "");
    await context.close();
  });
});
