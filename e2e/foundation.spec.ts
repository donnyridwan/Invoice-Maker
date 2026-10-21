import { expect, test } from "@playwright/test";
import { registerUser } from "./helpers";

test.describe("auth", () => {
  test("redirects anonymous users from /dashboard to /login with next", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });

  test("registers, logs out and logs back in with a messy email", async ({ page, context }) => {
    const { email, password } = await registerUser(page);

    const cookies = await context.cookies();
    expect(cookies.some((c) => c.name.includes("session_token"))).toBe(true);

    await context.clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email").fill(`  ${email.toUpperCase()} `);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page).not.toHaveURL(/\/login/);
    expect((await context.cookies()).some((c) => c.name.includes("session_token"))).toBe(true);
  });

  test("shows an error for a wrong password", async ({ page, context }) => {
    const { email } = await registerUser(page);
    await context.clearCookies();

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("salah-banget");
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.getByText("Email atau password salah")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("rejects a password shorter than 8 characters", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("Nama").fill("Donny");
    await page.getByLabel("Email").fill(`short+${Date.now()}@example.com`);
    await page.getByLabel("Password").fill("1234567");
    await page.getByRole("button", { name: "Daftar" }).click();
    await expect(page.getByText("Password minimal 8 karakter")).toBeVisible();
    await expect(page).toHaveURL(/\/register/);
  });
});

test.describe("shell", () => {
  test("shows a greeting and the sidebar navigation", async ({ page }) => {
    await registerUser(page);
    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Halo, Donny");
    const sidebar = page.getByRole("navigation", { name: "Menu utama" });
    await expect(sidebar.getByRole("link", { name: "Klien" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Katalog" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Pengaturan" })).toBeVisible();
  });

  test("signs out from the user menu", async ({ page }) => {
    await registerUser(page);
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Menu pengguna" }).click();
    await page.getByRole("menuitem", { name: "Keluar" }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });

  test("switches language from the user menu and ignores invalid locales", async ({
    page,
    context,
  }) => {
    await registerUser(page);
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Menu pengguna" }).click();
    await page.getByRole("menuitem", { name: "English" }).click();
    const sidebar = page.getByRole("navigation", { name: "Main menu" });
    await expect(sidebar.getByRole("link", { name: "Clients" })).toBeVisible();

    await context.addCookies([{ name: "NEXT_LOCALE", value: "fr", url: "http://localhost:3100" }]);
    await page.reload();
    await expect(
      page.getByRole("navigation", { name: "Menu utama" }).getByRole("link", { name: "Klien" }),
    ).toBeVisible();
  });
});
