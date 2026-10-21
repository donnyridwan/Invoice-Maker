import { expect, test } from "@playwright/test";
import { createInvoiceViaUi, EDITOR_URL_RE, registerUser } from "./helpers";

test.describe("invoices list", () => {
  test("lands in the editor after onboarding and lists the draft", async ({ page }) => {
    await registerUser(page, { onboarding: "stay" });
    await page.getByRole("button", { name: "Lanjut" }).click();
    await expect(page).toHaveURL(EDITOR_URL_RE);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^INV-\d{4}-001$/);

    await page.goto("/dashboard");
    const sidebar = page.getByRole("navigation", { name: "Menu utama" });
    await sidebar.getByRole("link", { name: "Invoice" }).click();
    await expect(page).toHaveURL(/\/invoices$/);

    // One invoice plus the header row.
    const rows = page.getByRole("row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText("Draft");
    await expect(rows.nth(1)).toContainText(/INV-\d{4}-001/);

    await page.getByRole("button", { name: "Invoice baru", exact: true }).first().click();
    await expect(page).toHaveURL(EDITOR_URL_RE);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^INV-\d{4}-002$/);
  });

  test("opens an invoice from its row and filters by search", async ({ page }) => {
    await registerUser(page);
    await createInvoiceViaUi(page);
    await page.goto("/invoices");
    await expect(page.getByRole("row")).toHaveCount(3);

    await page.getByLabel("Cari invoice").fill("-002");
    await page.getByLabel("Cari invoice").press("Enter");
    await expect(page).toHaveURL(/q=-002/);
    await expect(page.getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("row").nth(1)).toContainText("-002");

    await page.getByRole("row").nth(1).getByRole("link").click();
    await expect(page).toHaveURL(EDITOR_URL_RE);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/-002$/);

    await page.goto("/invoices?q=tidak-ada-yang-cocok");
    await expect(page.getByText("Tidak ada invoice yang cocok")).toBeVisible();
  });

  test("creates a draft for a client from the client page", async ({ page }) => {
    await registerUser(page);
    await page.goto("/clients/new");
    await page.getByLabel("Nama", { exact: true }).fill("Acme Inc");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page).toHaveURL(/\/clients$/);

    await page.getByRole("link", { name: "Acme Inc" }).click();
    await page.getByRole("button", { name: "Invoice baru untuk klien ini" }).click();
    await expect(page).toHaveURL(EDITOR_URL_RE);
    await expect(page.getByText("Acme Inc").first()).toBeVisible();
  });

  test("does not create another draft when a finished onboarding is reopened", async ({ page }) => {
    await registerUser(page);
    await page.goto("/onboarding");
    await page.getByRole("button", { name: "Lanjut" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/invoices");
    await expect(page.getByRole("row")).toHaveCount(2);
  });
});
