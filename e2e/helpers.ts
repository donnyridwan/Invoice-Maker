import { expect, type Page } from "@playwright/test";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import type { OutgoingEmail } from "../src/lib/email/transport";

export const DEFAULT_PASSWORD = "rahasia123";

export function uniqueEmail(): string {
  return `e2e+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export type RegisterOptions = {
  name?: string;
  email?: string;
  password?: string;
  /**
   * New accounts are sent to /onboarding. "skip" (default) clicks "Lewati", which lands in the
   * editor of a first draft invoice; the helper then opens /dashboard so the test can carry on in
   * the app. "stay" leaves the user on /onboarding.
   */
  onboarding?: "skip" | "stay";
};

/** Registers a new user through the UI and waits until the session is established. */
export async function registerUser(
  page: Page,
  opts: RegisterOptions = {},
): Promise<{ email: string; password: string }> {
  const email = opts.email ?? uniqueEmail();
  const password = opts.password ?? DEFAULT_PASSWORD;

  await page.goto("/register");
  await page.getByLabel("Nama").fill(opts.name ?? "Donny");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Daftar" }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  if ((opts.onboarding ?? "skip") === "skip") {
    await page.getByRole("button", { name: "Lewati" }).click();
    await expect(page).toHaveURL(EDITOR_URL_RE);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  }

  return { email, password };
}

/** `/invoices/<uuid>/edit`, capturing the invoice id. */
export const EDITOR_URL_RE = /\/invoices\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/edit$/;

/** Creates a draft from the invoice list ("Invoice baru") and returns its id (read from the URL). */
export async function createInvoiceViaUi(page: Page): Promise<string> {
  await page.goto("/invoices");
  await page.getByRole("button", { name: "Invoice baru", exact: true }).first().click();
  await expect(page).toHaveURL(EDITOR_URL_RE);
  const match = EDITOR_URL_RE.exec(new URL(page.url()).pathname);
  if (!match) throw new Error(`Not an editor URL: ${page.url()}`);
  return match[1];
}

function e2eDatabaseUrl(): string {
  const url = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/invoice_e2e";
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!/e2e/i.test(dbName)) throw new Error(`Refusing to touch "${dbName}": e2e helpers only run against an e2e database`);
  return url;
}

/**
 * Sets an invoice's stored status straight in the e2e database (`sent_at` is stamped for `sent`) and
 * returns its public token. Stands in for the owner UI where a test needs an invoice in a given state.
 */
export async function setStatusViaDb(
  invoiceId: string,
  status: "draft" | "sent" | "payment_claimed" | "paid" | "void",
): Promise<string> {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    const rows = await sql<{ public_token: string }[]>`
      UPDATE invoices
      SET status = ${status},
          sent_at = CASE WHEN ${status} = 'draft' THEN NULL ELSE coalesce(sent_at, now()) END,
          paid_at = CASE WHEN ${status} = 'paid' THEN now() ELSE paid_at END,
          voided_at = CASE WHEN ${status} = 'void' THEN now() ELSE voided_at END
      WHERE id = ${invoiceId}
      RETURNING public_token`;
    if (rows.length !== 1) throw new Error(`Invoice ${invoiceId} not found in the e2e database`);
    return rows[0].public_token;
  } finally {
    await sql.end();
  }
}

/** draft -> sent through the database (the owner UI for sending arrives later); returns the public token. */
export function markSentViaDb(invoiceId: string): Promise<string> {
  return setStatusViaDb(invoiceId, "sent");
}

/** The public token of an invoice, read from the e2e database. */
export async function publicTokenViaDb(invoiceId: string): Promise<string> {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    const rows = await sql<{ public_token: string }[]>`SELECT public_token FROM invoices WHERE id = ${invoiceId}`;
    if (rows.length !== 1) throw new Error(`Invoice ${invoiceId} not found in the e2e database`);
    return rows[0].public_token;
  } finally {
    await sql.end();
  }
}

/** A new user with a default BCA payment account and a client "Acme Inc". */
export async function setupOwner(page: Page): Promise<void> {
  await registerUser(page);

  await page.goto("/settings/payment-accounts");
  await page.getByRole("button", { name: "Tambah rekening" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama bank").fill("BCA");
  await dialog.getByLabel("Nama pemilik rekening").fill("Donny");
  await dialog.getByLabel("Nomor rekening").fill("1234567890");
  await dialog.getByLabel("Jadikan default").check();
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "BCA" })).toContainText("Default");

  await page.goto("/clients/new");
  await page.getByLabel("Nama", { exact: true }).fill("Acme Inc");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page).toHaveURL(/\/clients$/);
}

/** Creates a draft of Rp 1.500.000 for "Acme Inc" through the editor, waits for autosave and returns its id. */
export async function fillNewInvoice(page: Page, opts: { english?: boolean } = {}): Promise<string> {
  const id = await createInvoiceViaUi(page);
  await page.getByRole("combobox", { name: "Klien" }).click();
  await page.getByRole("option", { name: /Acme Inc/ }).click();
  const row = page.getByRole("group", { name: "Item 1" });
  await row.getByLabel("Nama item").fill("Desain logo");
  await row.getByLabel("Qty", { exact: true }).fill("1");
  await row.getByLabel("Harga", { exact: true }).fill("1.500.000");
  if (opts.english) {
    await page.getByLabel("Bahasa invoice").click();
    await page.getByRole("option", { name: "English" }).click();
  }
  await expect(page.getByText("Tersimpan", { exact: true })).toBeVisible();

  // Autosave is done once a reload shows the values.
  await page.reload();
  await expect(page.getByRole("group", { name: "Item 1" }).getByLabel("Harga", { exact: true })).toHaveValue("1.500.000");
  if (opts.english) await expect(page.getByRole("region", { name: "Preview invoice" })).toContainText("Bill to");
  return id;
}

/** Owner side: a user with a BCA account and a client, and a draft of Rp 1.500.000 for that client. */
export async function createInvoiceDraft(page: Page, opts: { english?: boolean } = {}): Promise<string> {
  await setupOwner(page);
  return fillNewInvoice(page, opts);
}

/** Moves an invoice's due date straight in the e2e database (to make it overdue). */
export async function setDueDateViaDb(invoiceId: string, dueDate: string): Promise<void> {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    const rows = await sql`UPDATE invoices SET due_date = ${dueDate} WHERE id = ${invoiceId} RETURNING id`;
    if (rows.length !== 1) throw new Error(`Invoice ${invoiceId} not found in the e2e database`);
  } finally {
    await sql.end();
  }
}

/** Turns an invoice into one of `totalMinor` in `currency`, with the stored base-currency rate (none when `fx` is null). */
export async function setForeignCurrencyViaDb(
  invoiceId: string,
  opts: { currency: string; totalMinor: number; fx: { rate: string; date: string } | null },
): Promise<void> {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    const rows = await sql`
      UPDATE invoices
      SET currency = ${opts.currency},
          subtotal_minor = ${opts.totalMinor},
          total_minor = ${opts.totalMinor},
          fx_rate_to_base = ${opts.fx?.rate ?? null},
          fx_rate_date = ${opts.fx?.date ?? null}
      WHERE id = ${invoiceId}
      RETURNING id`;
    if (rows.length !== 1) throw new Error(`Invoice ${invoiceId} not found in the e2e database`);
  } finally {
    await sql.end();
  }
}

const OUTBOX_DIR = path.join(process.cwd(), "var", "outbox");

/** Every email the file transport wrote to var/outbox/ for recipient `to` (in `to` or `cc`), oldest first. */
export async function readOutbox(to: string): Promise<OutgoingEmail[]> {
  let names: string[];
  try {
    names = (await readdir(OUTBOX_DIR)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const emails: OutgoingEmail[] = [];
  for (const name of names) {
    let raw: string;
    try {
      raw = await readFile(path.join(OUTBOX_DIR, name), "utf8");
    } catch {
      continue; // removed between readdir and read
    }
    const stored = JSON.parse(raw) as Omit<OutgoingEmail, "attachments"> & {
      attachments?: { filename: string; content: string }[];
    };
    const recipients = [...stored.to, ...(stored.cc ?? [])].map((address) => address.toLowerCase());
    if (!recipients.includes(to.toLowerCase())) continue;
    emails.push({
      ...stored,
      attachments: stored.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content, "base64") })),
    });
  }
  return emails;
}

/** Empties var/outbox/ (call in beforeAll so old runs never show up; emails are also scoped by recipient). */
export async function clearOutbox(): Promise<void> {
  await rm(OUTBOX_DIR, { recursive: true, force: true });
}

/** The first http(s) URL in an email's text body. */
export function firstLink(email: OutgoingEmail): string {
  const match = /https?:\/\/[^\s<>"]+/.exec(email.text);
  if (!match) throw new Error(`No link in the email "${email.subject}"`);
  return match[0];
}

/** Marks an account's email as verified straight in the e2e database (the verification flow has its own test). */
export async function verifyEmailViaDb(email: string): Promise<void> {
  const sql = postgres(e2eDatabaseUrl(), { max: 1, onnotice: () => {} });
  try {
    const rows = await sql`UPDATE "user" SET email_verified = true WHERE email = ${email} RETURNING id`;
    if (rows.length !== 1) throw new Error(`User ${email} not found in the e2e database`);
  } finally {
    await sql.end();
  }
}
