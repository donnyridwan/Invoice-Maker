import { expect, type Page } from "@playwright/test";

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
