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
   * New accounts are sent to /onboarding. "skip" (default) clicks "Lewati" so the test can carry
   * on in the app; "stay" leaves the user on /onboarding.
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
    await expect(page).toHaveURL(/\/dashboard/);
  }

  return { email, password };
}
