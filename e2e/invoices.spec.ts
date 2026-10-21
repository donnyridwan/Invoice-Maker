import { expect, test, type Page } from "@playwright/test";
import { createInvoiceViaUi, EDITOR_URL_RE, registerUser } from "./helpers";

test.describe("invoices list", () => {
  test("lands in the editor after onboarding and lists the draft", async ({ page }) => {
    await registerUser(page, { onboarding: "stay" });
    await page.getByRole("button", { name: "Lanjut" }).click();
    await expect(page).toHaveURL(EDITOR_URL_RE);
    await expect(page.getByRole("heading", { level: 1, name: /^INV-/ })).toHaveText(/^INV-\d{4}-001$/);

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
    await expect(page.getByRole("heading", { level: 1, name: /^INV-/ })).toHaveText(/^INV-\d{4}-002$/);
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
    await expect(page.getByRole("heading", { level: 1, name: /^INV-/ })).toHaveText(/-002$/);

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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function plusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Registers a user with a client "Acme Inc" and opens a fresh draft (number ...-002) in the editor. */
async function openEditorWithClient(page: Page) {
  await registerUser(page);
  await page.goto("/clients/new");
  await page.getByLabel("Nama", { exact: true }).fill("Acme Inc");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page).toHaveURL(/\/clients$/);
  await createInvoiceViaUi(page);
  await expect(page.getByRole("heading", { level: 1, name: /^INV-/ })).toHaveText(/-002$/);
}

test.describe("editor", () => {
  test("fills an invoice with the keyboard, previews it live and autosaves", async ({ page }) => {
    await openEditorWithClient(page);
    const preview = page.getByRole("region", { name: "Preview invoice" });

    await page.getByRole("combobox", { name: "Klien" }).click();
    await page.getByRole("option", { name: /Acme Inc/ }).click();
    await expect(page.getByRole("combobox", { name: "Klien" })).toHaveValue("Acme Inc");

    const first = page.getByRole("group", { name: "Item 1" });
    await first.getByLabel("Nama item").fill("Desain logo");
    await first.getByLabel("Qty", { exact: true }).fill("2");
    await first.getByLabel("Harga", { exact: true }).fill("1.500.000");
    await expect(first.getByLabel("Jumlah", { exact: true })).toHaveText(/Rp\s3\.000\.000/);

    // Enter in the last price field adds a row and focuses its name.
    await first.getByLabel("Harga", { exact: true }).press("Enter");
    const second = page.getByRole("group", { name: "Item 2" });
    await expect(second.getByLabel("Nama item")).toBeFocused();
    await page.keyboard.type("Revisi");
    await second.getByLabel("Qty", { exact: true }).fill("1,5");
    await second.getByLabel("Harga", { exact: true }).fill("200.000");
    // Enter after the last filled row opens a third one; Enter on that empty row adds no fourth.
    await second.getByLabel("Harga", { exact: true }).press("Enter");
    const third = page.getByRole("group", { name: "Item 3" });
    await expect(third.getByLabel("Nama item")).toBeFocused();
    await third.getByLabel("Harga", { exact: true }).press("Enter");
    await expect(page.getByRole("group", { name: /^Item \d$/ })).toHaveCount(3);

    await expect(preview).toContainText("Acme Inc");
    await expect(preview).toContainText("Desain logo");
    await expect(preview).toContainText(/Rp\s3\.300\.000/);
    await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("combobox", { name: "Klien" })).toHaveValue("Acme Inc");
    await expect(page.getByRole("group", { name: "Item 1" }).getByLabel("Nama item")).toHaveValue("Desain logo");
    await expect(page.getByRole("group", { name: "Item 1" }).getByLabel("Harga", { exact: true })).toHaveValue("1.500.000");
    await expect(page.getByRole("group", { name: "Item 2" }).getByLabel("Qty", { exact: true })).toHaveValue("1,5");
    await expect(page.getByRole("group", { name: "Item 2" }).getByLabel("Harga", { exact: true })).toHaveValue("200.000");
    await expect(preview).toContainText(/Rp\s3\.300\.000/);

    await expect(preview).not.toContainText("Bill to");
    await page.getByLabel("Bahasa invoice").click();
    await page.getByRole("option", { name: "English" }).click();
    await expect(preview).toContainText("Bill to");
    await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();
  });

  test("sets the due date from the quick terms", async ({ page }) => {
    await openEditorWithClient(page);
    const issue = await page.getByLabel("Tanggal terbit").inputValue();
    expect(issue).toMatch(DATE_RE);

    await page.getByRole("button", { name: "30 hari" }).click();
    await expect(page.getByLabel("Jatuh tempo", { exact: true })).toHaveValue(plusDays(issue, 30));
    await expect(page.getByRole("button", { name: "30 hari" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Saat diterima" }).click();
    await expect(page.getByLabel("Jatuh tempo", { exact: true })).toHaveValue(issue);
    await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();

    // Moving the issue date keeps the term.
    await page.getByRole("button", { name: "14 hari" }).click();
    await page.getByLabel("Tanggal terbit").fill(plusDays(issue, 3));
    await expect(page.getByLabel("Jatuh tempo", { exact: true })).toHaveValue(plusDays(issue, 17));
  });

  test("rejects a number that another invoice already uses", async ({ page }) => {
    await openEditorWithClient(page);
    const number = page.getByLabel("Nomor invoice");
    const own = await number.inputValue();
    const other = own.replace(/-002$/, "-001");
    expect(other).not.toBe(own);

    await number.fill(other);
    await expect(page.getByText("Nomor invoice sudah dipakai")).toBeVisible();
    await expect(page.getByText("Perbaiki isian yang ditandai")).toBeVisible();

    await number.fill(own);
    await expect(page.getByText("Nomor invoice sudah dipakai")).toHaveCount(0);
    await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();
  });

  test("flags an invalid price and keeps the last saved value", async ({ page }) => {
    await openEditorWithClient(page);
    const row = page.getByRole("group", { name: "Item 1" });
    await row.getByLabel("Nama item").fill("Hosting");
    await row.getByLabel("Harga", { exact: true }).fill("100.000");
    await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();

    await row.getByLabel("Harga", { exact: true }).fill("abc");
    await expect(page.getByText("Perbaiki isian yang ditandai")).toBeVisible();
    await expect(row.getByText("Jumlah tidak valid.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Preview invoice" })).toContainText("Hosting");

    await page.reload();
    await expect(page.getByRole("group", { name: "Item 1" }).getByLabel("Harga", { exact: true })).toHaveValue("100.000");
  });

  test("switches between the form and the preview on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openEditorWithClient(page);
    const preview = page.getByRole("region", { name: "Preview invoice" });

    await expect(page.getByRole("tab", { name: "Isi" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Nomor invoice")).toBeVisible();
    await expect(preview).toBeHidden();

    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("INV-");
    await expect(page.getByLabel("Nomor invoice")).toBeHidden();
    const box = await preview.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(390);
  });
});

async function addCatalogItem(page: Page, item: { name: string; price: string; unit?: string }) {
  await page.goto("/catalog");
  await page.getByRole("button", { name: "Item baru" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama", { exact: true }).fill(item.name);
  if (item.unit) await dialog.getByLabel("Satuan", { exact: true }).fill(item.unit);
  await dialog.getByLabel("Harga satuan").fill(item.price);
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe("editor extras", () => {
  test("fills an item from the catalog autocomplete", async ({ page }) => {
    await registerUser(page);
    await addCatalogItem(page, { name: "Desain logo", price: "1.500.000", unit: "proyek" });
    await createInvoiceViaUi(page);

    const row = page.getByRole("group", { name: "Item 1" });
    const name = row.getByLabel("Nama item");
    await name.fill("desa");
    await expect(page.getByRole("option", { name: /Desain logo/ })).toBeVisible();
    await page.getByRole("option", { name: /Desain logo/ }).click();
    await expect(name).toHaveValue("Desain logo");
    await expect(row.getByLabel("Harga", { exact: true })).toHaveValue("1.500.000");
    await expect(row.getByLabel("Satuan", { exact: true })).toHaveValue("proyek");

    // The same with the keyboard: arrows and Enter pick, Escape closes.
    await page.getByRole("button", { name: "Tambah item" }).click();
    const second = page.getByRole("group", { name: "Item 2" });
    await expect(second.getByLabel("Nama item")).toBeFocused();
    await page.keyboard.type("LOGO");
    await expect(page.getByRole("option", { name: /Desain logo/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("option")).toHaveCount(0);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(second.getByLabel("Nama item")).toHaveValue("Desain logo");
    await expect(second.getByLabel("Harga", { exact: true })).toHaveValue("1.500.000");
  });

  test("saves an item to the catalog", async ({ page }) => {
    await registerUser(page);
    await createInvoiceViaUi(page);
    const row = page.getByRole("group", { name: "Item 1" });
    await expect(row.getByRole("button", { name: "Simpan ke katalog" })).toBeDisabled();

    await row.getByLabel("Nama item").fill("Konsultasi");
    await row.getByLabel("Harga", { exact: true }).fill("750.000");
    await row.getByRole("button", { name: "Simpan ke katalog" }).click();
    await expect(page.getByText("Disimpan ke katalog")).toBeVisible();

    await page.goto("/catalog");
    const catalogRow = page.getByRole("row").filter({ hasText: "Konsultasi" });
    await expect(catalogRow).toContainText(/Rp\s750\.000/);
  });

  test("creates a client from the editor and selects it", async ({ page }) => {
    await registerUser(page);
    await createInvoiceViaUi(page);

    await page.getByRole("combobox", { name: "Klien" }).click();
    await page.getByRole("option", { name: "+ Klien baru" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nama", { exact: true }).fill("Beta LLC");
    await dialog.getByLabel("Email").fill("billing@beta.example");
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(dialog).toHaveCount(0);

    await expect(page.getByRole("combobox", { name: "Klien" })).toHaveValue("Beta LLC");
    await expect(page.getByRole("region", { name: "Preview invoice" })).toContainText("Beta LLC");
    await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();

    // The client exists for real: it survives a reload and shows up in the client list.
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Klien" })).toHaveValue("Beta LLC");
    await page.goto("/clients");
    await expect(page.getByRole("link", { name: "Beta LLC" })).toBeVisible();
  });

  test("picks a template and an accent colour, and keeps them", async ({ page }) => {
    await registerUser(page);
    await createInvoiceViaUi(page);
    const preview = page.getByRole("region", { name: "Preview invoice" });

    await expect(page.getByRole("radio", { name: "Minimal" })).toBeChecked();
    await page.getByRole("radio", { name: "Modern" }).click();
    await expect(page.getByRole("radio", { name: "Modern" })).toBeChecked();
    await expect(preview.locator('[data-template="modern"]')).toBeVisible();

    await page.getByLabel("Kode warna (hex)").fill("#00A67E");
    await expect(preview.locator('[data-template="modern"]')).toHaveAttribute("style", /#00A67E/i);
    await page.getByRole("button", { name: "#0A2540" }).click();
    await expect(page.getByLabel("Kode warna (hex)")).toHaveValue("#0A2540");
    await page.getByLabel("Kode warna (hex)").fill("#00A67E");
    await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("radio", { name: "Modern" })).toBeChecked();
    await expect(page.getByLabel("Kode warna (hex)")).toHaveValue(/^#00a67e$/i);
    await expect(preview.locator('[data-template="modern"]')).toHaveAttribute("style", /#00A67E/i);
  });

  test("reorders items by dragging", async ({ page }) => {
    await registerUser(page);
    await createInvoiceViaUi(page);

    const first = page.getByRole("group", { name: "Item 1" });
    await first.getByLabel("Nama item").fill("Pertama");
    await first.getByLabel("Harga", { exact: true }).press("Enter");
    await page.keyboard.type("Kedua");
    await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();

    const handle = page.getByRole("group", { name: "Item 2" }).getByRole("button", { name: /Geser item 2/ });
    const target = await page.getByRole("group", { name: "Item 1" }).boundingBox();
    const from = await handle.boundingBox();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(from!.x + from!.width / 2, from!.y - 10, { steps: 5 });
    await page.mouse.move(from!.x + from!.width / 2, target!.y + 10, { steps: 15 });
    await page.mouse.up();

    await expect(page.getByRole("group", { name: "Item 1" }).getByLabel("Nama item")).toHaveValue("Kedua");
    await expect(page.getByRole("group", { name: "Item 2" }).getByLabel("Nama item")).toHaveValue("Pertama");
    await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("group", { name: "Item 1" }).getByLabel("Nama item")).toHaveValue("Kedua");
    await expect(page.getByRole("group", { name: "Item 2" }).getByLabel("Nama item")).toHaveValue("Pertama");
  });

  test("shows autosaved changes in the list without a server revalidation", async ({ page }) => {
    await openEditorWithClient(page);
    const row = page.getByRole("group", { name: "Item 1" });
    await row.getByLabel("Nama item").fill("Hosting");
    await row.getByLabel("Harga", { exact: true }).fill("250.000");
    await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Kembali ke daftar invoice" }).click();
    await expect(page).toHaveURL(/\/invoices$/);
    await expect(page.getByRole("row").filter({ hasText: "-002" })).toContainText(/Rp\s250\.000/);
  });

  test("duplicates an invoice into a new draft", async ({ page }) => {
    await openEditorWithClient(page);
    const before = page.url();
    await page.getByRole("combobox", { name: "Klien" }).click();
    await page.getByRole("option", { name: /Acme Inc/ }).click();
    const row = page.getByRole("group", { name: "Item 1" });
    await row.getByLabel("Nama item").fill("Desain logo");
    await row.getByLabel("Harga", { exact: true }).fill("1.500.000");
    await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Aksi invoice" }).click();
    await page.getByRole("menuitem", { name: "Duplikat" }).click();
    await expect(page).toHaveURL(EDITOR_URL_RE);
    await expect(page).not.toHaveURL(before);
    await expect(page.getByRole("heading", { level: 1, name: /^INV-/ })).toHaveText(/-003$/);
    await expect(page.getByRole("group", { name: "Item 1" }).getByLabel("Nama item")).toHaveValue("Desain logo");
    await expect(page.getByRole("group", { name: "Item 1" }).getByLabel("Harga", { exact: true })).toHaveValue("1.500.000");
    await expect(page.getByRole("combobox", { name: "Klien" })).toHaveValue("Acme Inc");
  });

  test("deletes a draft and shows the empty state when it was the last one", async ({ page }) => {
    await openEditorWithClient(page);
    await page.getByRole("button", { name: "Aksi invoice" }).click();
    await page.getByRole("menuitem", { name: "Hapus draft" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(/INV-\d{4}-002/);
    await dialog.getByRole("button", { name: "Hapus", exact: true }).click();
    await expect(page).toHaveURL(/\/invoices$/);
    await expect(page.getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("table")).not.toContainText("-002");
    await expect(page.getByRole("table")).toContainText("-001");

    // Delete the only draft left.
    await page.getByRole("row").nth(1).getByRole("link").click();
    await expect(page).toHaveURL(EDITOR_URL_RE);
    await page.getByRole("button", { name: "Aksi invoice" }).click();
    await page.getByRole("menuitem", { name: "Hapus draft" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Hapus", exact: true }).click();
    await expect(page).toHaveURL(/\/invoices$/);
    await expect(page.getByText("Belum ada invoice")).toBeVisible();
    await expect(page.getByRole("button", { name: "Invoice baru", exact: true }).first()).toBeVisible();
  });
});
