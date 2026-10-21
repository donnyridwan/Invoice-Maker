import { expect, test, type Page } from "@playwright/test";
import { clearOutbox, fillNewInvoice, firstLink, readOutbox, registerUser, verifyEmailViaDb } from "./helpers";

test.beforeAll(async () => {
  await clearOutbox();
});

test.describe("verify", () => {
  test("sends a verification link from Settings and verifies the email when it is opened", async ({ page }) => {
    const { email } = await registerUser(page);

    await page.goto("/settings");
    const card = page.getByRole("region", { name: "Verifikasi email" });
    await expect(card.getByText("Belum diverifikasi")).toBeVisible();
    expect(await readOutbox(email)).toHaveLength(0);

    await card.getByRole("button", { name: "Kirim link verifikasi" }).click();
    await expect(card.getByText(/Link verifikasi dikirim ke/)).toBeVisible();

    await expect.poll(async () => (await readOutbox(email)).length).toBe(1);
    const [message] = await readOutbox(email);
    expect(message.subject).toBe("Verifikasi email kamu");
    expect(message.from).toBe('"Invoice Maker" <invoice@example.test>');
    expect(message.html).toContain("Verifikasi email");
    const link = firstLink(message);
    expect(link).toContain("/api/auth/verify-email?token=");
    expect(message.html).toContain("verify-email?token=");

    await page.goto(link);
    await expect(page).toHaveURL(/\/settings\?verified=1$/);
    const verifiedCard = page.getByRole("region", { name: "Verifikasi email" });
    await expect(verifiedCard.getByText("Terverifikasi", { exact: true })).toBeVisible();
    await expect(verifiedCard.getByRole("button", { name: "Kirim link verifikasi" })).toHaveCount(0);
  });

  test("writes the verification email in English when the locale cookie says so", async ({ page, context }) => {
    const { email } = await registerUser(page);
    await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: "http://localhost:3100" }]);

    await page.goto("/settings");
    await page.getByRole("button", { name: "Send verification link" }).click();
    await expect.poll(async () => (await readOutbox(email)).length).toBe(1);
    const [message] = await readOutbox(email);
    expect(message.subject).toBe("Verify your email");
  });
});

/** A new owner with a client "Acme Inc" that has an email address, and a draft invoice for it. */
async function ownerWithDraft(
  page: Page,
  opts: { verified: boolean },
): Promise<{ email: string; id: string; clientEmail: string }> {
  // Unique per test: the outbox is read by recipient.
  const clientEmail = `billing+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@acme.test`;
  const { email } = await registerUser(page);
  if (opts.verified) await verifyEmailViaDb(email);
  await page.goto("/clients/new");
  await page.getByLabel("Nama", { exact: true }).fill("Acme Inc");
  await page.getByLabel("Email").fill(clientEmail);
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page).toHaveURL(/\/clients$/);
  const id = await fillNewInvoice(page);
  return { email, id, clientEmail };
}

test.describe("send invoice", () => {
  test("emails the invoice with the PDF attached and marks it sent", async ({ page }) => {
    const { email: ownerEmail, clientEmail } = await ownerWithDraft(page, { verified: true });
    const titleRow = page.getByRole("heading", { level: 1, name: /^INV-/ }).locator("..");
    await expect(titleRow).toContainText("Draft");

    await page.getByRole("button", { name: "Kirim", exact: true }).click();
    await page.getByRole("menuitem", { name: "Kirim lewat email" }).click();

    const dialog = page.getByRole("dialog", { name: "Kirim lewat email" });
    await expect(dialog.getByLabel("Kepada")).toHaveValue(clientEmail);
    await expect(dialog.getByLabel("Subjek")).toHaveValue(/^Invoice INV-.+ dari Donny$/);
    await expect(dialog.getByLabel("Pesan")).toHaveValue(/Halo Acme Inc,[\s\S]*Rp\s?1\.500\.000/);
    await expect(dialog.getByText("PDF invoice akan dilampirkan.")).toBeVisible();
    await dialog.getByLabel("CC").fill("akuntan@acme.test");
    await dialog.getByRole("button", { name: "Kirim", exact: true }).click();

    await expect(page.getByText("Email terkirim", { exact: true })).toBeVisible();
    await expect(titleRow).toContainText("Terkirim");

    const emails = await readOutbox(clientEmail);
    expect(emails).toHaveLength(1);
    const [email] = emails;
    expect(email.replyTo).toBe(ownerEmail);
    expect(email.cc).toEqual(["akuntan@acme.test"]);
    expect(email.from).toMatch(/^"Donny" <invoice@example\.test>$/);
    expect(email.html).toContain("Lihat invoice");
    expect(email.html).toMatch(/Rp\s?1\.500\.000/);
    expect(email.text).toMatch(/\/i\/[\w-]{20,}/);
    expect(email.attachments).toHaveLength(1);
    expect(email.attachments![0].filename).toMatch(/^INV-.+\.pdf$/);
    expect(Buffer.from(email.attachments![0].content).subarray(0, 5).toString()).toBe("%PDF-");

    // The activity shows it, and the public link in the email opens the invoice.
    await page.getByRole("link", { name: "Lihat", exact: true }).click();
    await expect(page.getByRole("region", { name: "Aktivitas" })).toContainText("Dikirim lewat email");
    const publicLink = /https?:\/\/\S+\/i\/[\w-]+/.exec(email.text)![0];
    await page.goto(publicLink);
    await expect(page.getByText(/Rp\s1\.500\.000/).first()).toBeVisible();
  });

  test("shows a field error for an invalid CC address and sends nothing", async ({ page }) => {
    const { clientEmail } = await ownerWithDraft(page, { verified: true });
    await page.getByRole("button", { name: "Kirim", exact: true }).click();
    await page.getByRole("menuitem", { name: "Kirim lewat email" }).click();
    const dialog = page.getByRole("dialog", { name: "Kirim lewat email" });
    await expect(dialog.getByLabel("Kepada")).toHaveValue(clientEmail);

    await dialog.getByLabel("CC").fill("bukan-email");
    await dialog.getByRole("button", { name: "Kirim", exact: true }).click();
    await expect(dialog.getByText("Format email tidak valid", { exact: false })).toBeVisible();
    await dialog.getByLabel("CC").fill("");
    await dialog.getByLabel("Kepada").fill("");
    await dialog.getByRole("button", { name: "Kirim", exact: true }).click();
    await expect(dialog.getByText("Wajib diisi", { exact: false })).toBeVisible();
    expect(await readOutbox(clientEmail)).toHaveLength(0);
  });

  test("asks an unverified owner to verify first and mails the verification link", async ({ page }) => {
    const { email: ownerEmail, clientEmail } = await ownerWithDraft(page, { verified: false });
    await page.getByRole("button", { name: "Kirim", exact: true }).click();
    await page.getByRole("menuitem", { name: "Kirim lewat email" }).click();

    const dialog = page.getByRole("dialog", { name: "Verifikasi email kamu dulu" });
    await expect(dialog).toContainText(ownerEmail);
    await expect(dialog.getByLabel("Kepada")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Kirim link verifikasi" }).click();
    await expect(dialog.getByText(/Link verifikasi dikirim ke/)).toBeVisible();

    await expect.poll(async () => (await readOutbox(ownerEmail)).length).toBe(1);
    expect((await readOutbox(ownerEmail))[0].subject).toBe("Verifikasi email kamu");
    expect(await readOutbox(clientEmail)).toHaveLength(0);
  });
});
