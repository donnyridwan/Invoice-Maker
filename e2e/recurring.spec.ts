import { expect, test, type Page } from "@playwright/test";
import { clearOutbox, createInvoiceDraft, fillNewInvoice, readOutbox, registerUser, setStatusViaDb, verifyEmailViaDb } from "./helpers";

test.beforeAll(async () => {
  await clearOutbox();
});

/** Today's date in Asia/Jakarta (YYYY-MM-DD), like the server computes it. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function runCron(page: Page) {
  const response = await page.request.get("/api/cron/recurring", {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as { processed: number; created: number; failed: number; skipped: number };
}

async function openRecurringDialog(page: Page, name: "Jadikan berulang" | "Atur jadwal berulang") {
  await page.getByRole("button", { name: "Aksi invoice" }).click();
  await page.getByRole("menuitem", { name }).click();
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog.getByRole("radiogroup", { name: "Frekuensi" })).toBeVisible();
  return dialog;
}

function scheduleCard(page: Page) {
  return page.getByRole("region", { name: "Invoice berulang" });
}

test.describe("recurring invoices", () => {
  test("makes an invoice recurring, generates the next one through the cron, pauses and lists it", async ({ page }) => {
    const id = await createInvoiceDraft(page);
    const first = (await page.getByRole("heading", { level: 1, name: /^INV-/ }).textContent())!.trim();

    const dialog = await openRecurringDialog(page, "Jadikan berulang");
    await dialog.getByRole("radio", { name: "Bulanan" }).click();
    await dialog.getByLabel("Invoice berikutnya").fill(today());
    const day = Number(today().slice(8));
    await expect(dialog.getByText(new RegExp(`^Invoice dibuat setiap bulan pada tanggal ${day}, mulai `))).toBeVisible();
    await dialog.getByRole("button", { name: "Simpan" }).click();

    await expect(page.getByText("Jadwal berulang disimpan", { exact: true })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect(scheduleCard(page)).toContainText("Aktif");
    await expect(scheduleCard(page)).toContainText("Sudah dibuat 0 kali");
    await expect(scheduleCard(page)).toContainText("Dibuat sebagai draft");

    // The cron creates the invoice that is due today (next number) and moves the schedule on.
    const result = await runCron(page);
    expect(result).toEqual({ processed: 1, created: 1, failed: 0, skipped: 0 });
    expect(await runCron(page)).toEqual({ processed: 0, created: 0, failed: 0, skipped: 0 });

    // The dashboard points at the draft that is ready to be reviewed and sent.
    await page.goto("/dashboard");
    const banner = page.getByTestId("recurring-drafts-banner");
    await expect(banner).toContainText("1 invoice berulang siap dikirim");
    await banner.getByRole("link", { name: "Tinjau" }).click();
    await expect(page).toHaveURL(/\/invoices\?tab=draft$/);

    await page.goto("/invoices");
    const rows = page.getByRole("row");
    await expect(rows.filter({ hasText: /INV-\d{4}-003/ })).toHaveCount(1);
    await expect(rows.filter({ hasText: /INV-\d{4}-003/ })).toContainText("Draft");

    await page.goto(`/invoices/${id}/edit`);
    await expect(scheduleCard(page)).toContainText("Sudah dibuat 1 kali");
    await expect(scheduleCard(page).getByText(/^Berikutnya: /)).toBeVisible();

    // Pause.
    await scheduleCard(page).getByRole("button", { name: "Jeda" }).click();
    await expect(scheduleCard(page)).toContainText("Dijeda");
    await expect(scheduleCard(page).getByRole("button", { name: "Lanjutkan" })).toBeVisible();

    // The "Berulang" tab lists it.
    await page.goto("/invoices");
    await page.getByRole("link", { name: /^Berulang/ }).click();
    await expect(page).toHaveURL(/\/invoices\/recurring$/);
    const row = page.getByRole("row").filter({ hasText: first });
    await expect(row).toContainText("Acme Inc");
    await expect(row).toContainText("Setiap bulan");
    await expect(row).toContainText("Dijeda");
    await expect(row).toContainText(/Rp\s1\.500\.000/);
  });

  test("validates the dialog, edits the schedule, resumes and stops it", async ({ page }) => {
    const id = await createInvoiceDraft(page);
    // A sent invoice is managed from its detail page.
    await page.getByRole("button", { name: "Kirim", exact: true }).click();
    await page.getByRole("menuitem", { name: "Salin link" }).click();
    await expect(page.getByText("Link disalin", { exact: true })).toBeVisible();
    await page.goto(`/invoices/${id}`);
    await expect(scheduleCard(page)).toContainText("Ulangi invoice ini secara otomatis");

    await scheduleCard(page).getByRole("button", { name: "Jadikan berulang" }).click();
    const dialog = page.getByRole("dialog", { name: "Jadikan berulang" });
    await expect(dialog.getByRole("radiogroup", { name: "Frekuensi" })).toBeVisible();
    await dialog.getByLabel("Invoice berikutnya").fill(addDays(today(), -1));
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(dialog.getByText("Tanggal tidak boleh sebelum hari ini")).toBeVisible();

    // Every 2 weeks, ending after 3 invoices.
    await dialog.getByRole("radio", { name: "Mingguan" }).click();
    await dialog.getByLabel("Setiap", { exact: true }).fill("2");
    await dialog.getByLabel("Invoice berikutnya").fill(addDays(today(), 7));
    await dialog.getByRole("radio", { name: "Setelah" }).check();
    await dialog.getByLabel("Jumlah invoice").fill("3");
    await expect(dialog.getByText(/^Invoice dibuat setiap 2 minggu pada hari \w+, mulai .*, berakhir setelah 3 kali\.$/)).toBeVisible();
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(scheduleCard(page)).toContainText("Aktif");
    await expect(scheduleCard(page)).toContainText("setiap 2 minggu");
    await expect(scheduleCard(page)).toContainText("Berakhir setelah 3 kali");

    // Edit: monthly, never ends.
    await scheduleCard(page).getByRole("button", { name: "Ubah" }).click();
    const edit = page.getByRole("dialog", { name: "Atur jadwal berulang" });
    await expect(edit.getByRole("radio", { name: "Mingguan" })).toHaveAttribute("aria-checked", "true");
    await expect(edit.getByLabel("Setiap", { exact: true })).toHaveValue("2");
    await edit.getByRole("radio", { name: "Bulanan" }).click();
    await edit.getByRole("radio", { name: "Tidak pernah" }).check();
    await edit.getByLabel("Setiap", { exact: true }).fill("1");
    await edit.getByRole("button", { name: "Simpan" }).click();
    await expect(scheduleCard(page)).toContainText("setiap bulan");
    await expect(scheduleCard(page)).not.toContainText("Berakhir setelah");

    // Pause and resume.
    await scheduleCard(page).getByRole("button", { name: "Jeda" }).click();
    await expect(scheduleCard(page)).toContainText("Dijeda");
    await scheduleCard(page).getByRole("button", { name: "Lanjutkan" }).click();
    await expect(scheduleCard(page)).toContainText("Aktif");

    // Stop: the invoice can be made recurring again.
    await scheduleCard(page).getByRole("button", { name: "Hentikan" }).click();
    await page.getByRole("dialog", { name: "Hentikan jadwal berulang?" }).getByRole("button", { name: "Hentikan" }).click();
    await expect(scheduleCard(page)).toContainText("Ulangi invoice ini secara otomatis");
    await page.goto("/invoices/recurring");
    await expect(page.getByText("Belum ada invoice berulang")).toBeVisible();
  });

  test("shows a schedule whose source was voided as stopped, with the reason and nothing to resume", async ({ page }) => {
    const id = await createInvoiceDraft(page);
    const dialog = await openRecurringDialog(page, "Jadikan berulang");
    await dialog.getByLabel("Invoice berikutnya").fill(today());
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(scheduleCard(page)).toContainText("Aktif");

    await setStatusViaDb(id, "void");
    const result = await runCron(page);
    expect(result.failed).toBe(0);

    await page.goto(`/invoices/${id}`);
    const card = scheduleCard(page);
    await expect(card).toContainText("Berhenti");
    await expect(card).not.toContainText("Dijeda");
    await expect(card).toContainText("Invoice sumber dihapus atau di-void, jadi jadwal dihentikan.");
    await expect(card.getByRole("button", { name: "Lanjutkan" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Hentikan" })).toBeVisible();

    await page.goto("/invoices/recurring");
    await expect(page.getByRole("row").filter({ hasText: "Berhenti" })).toHaveCount(1);
  });

  test("offers automatic email only to a verified owner with a client that has an email, and sends it", async ({ page }) => {
    const clientEmail = `billing+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@acme.test`;
    const { email: ownerEmail } = await registerUser(page);
    await page.goto("/clients/new");
    await page.getByLabel("Nama", { exact: true }).fill("Acme Inc");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page).toHaveURL(/\/clients$/);
    const id = await fillNewInvoice(page);

    // Not verified and the client has no email: the option is off, with the reasons.
    let dialog = await openRecurringDialog(page, "Jadikan berulang");
    await expect(dialog.getByRole("radio", { name: "Buat draft & beri tahu saya" })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "Kirim email otomatis" })).toBeDisabled();
    await expect(dialog.getByText("Verifikasi email kamu di Pengaturan terlebih dahulu.")).toBeVisible();
    await dialog.getByRole("button", { name: "Batal" }).click();

    // Verified, and the client gets an address.
    await verifyEmailViaDb(ownerEmail);
    await page.goto("/clients");
    await page.getByRole("link", { name: "Acme Inc" }).click();
    await page.getByLabel("Email").fill(clientEmail);
    await page.getByRole("button", { name: "Simpan" }).click();
    await page.goto(`/invoices/${id}/edit`);

    dialog = await openRecurringDialog(page, "Jadikan berulang");
    await dialog.getByLabel("Invoice berikutnya").fill(today());
    await dialog.getByRole("radio", { name: "Kirim email otomatis" }).check();
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(scheduleCard(page)).toContainText("Dikirim otomatis lewat email");

    expect(await runCron(page)).toEqual({ processed: 1, created: 1, failed: 0, skipped: 0 });
    const emails = await readOutbox(clientEmail);
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toMatch(/^Invoice INV-\d{4}-003 dari Donny$/);
    expect(Buffer.from(emails[0].attachments![0].content).subarray(0, 5).toString()).toBe("%PDF-");

    await page.goto("/invoices");
    await expect(page.getByRole("row").filter({ hasText: /INV-\d{4}-003/ })).toContainText("Terkirim");
  });
});
