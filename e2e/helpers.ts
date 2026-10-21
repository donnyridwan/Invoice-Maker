import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

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
