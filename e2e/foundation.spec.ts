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

test.describe("onboarding", () => {
  test("saves the business name, then completes the checklist from settings", async ({ page }) => {
    await registerUser(page, { onboarding: "stay" });
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("link", { name: "Klien" })).toHaveCount(0);

    await page.getByLabel("Nama bisnis").fill("Studio Donny");
    await page.getByRole("button", { name: "Lanjut" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    const profileItem = page.getByRole("listitem").filter({ hasText: "Lengkapi profil bisnis" });
    await expect(profileItem).toHaveAttribute("data-done", "false");

    await page.goto("/settings");
    await expect(page.getByLabel("Nama bisnis")).toHaveValue("Studio Donny");
    const profileCard = page.getByRole("region", { name: "Profil bisnis" });
    await profileCard.getByLabel("Alamat").fill("Jl. Sudirman No. 1, Jakarta");
    await profileCard.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Tersimpan")).toBeVisible();

    await page.goto("/dashboard");
    await expect(profileItem).toHaveAttribute("data-done", "true");
    await expect(page.getByRole("listitem").filter({ hasText: "Tambah rekening pembayaran" })).toHaveAttribute(
      "data-done",
      "false",
    );
  });

  test("creates a first bank account during onboarding", async ({ page }) => {
    await registerUser(page, { onboarding: "stay" });

    await page.getByRole("button", { name: "Tambah rekening" }).click();
    await page.getByLabel("Nama bank").fill("BCA");
    await page.getByLabel("Nama pemilik rekening").fill("Donny");
    await page.getByLabel("Nomor rekening").fill("1234567890");
    await page.getByRole("button", { name: "Lanjut" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("listitem").filter({ hasText: "Tambah rekening pembayaran" })).toHaveAttribute(
      "data-done",
      "true",
    );

    await page.goto("/settings/payment-accounts");
    await expect(page.getByRole("listitem").filter({ hasText: "BCA" })).toContainText("Default");
  });

  test("lets a new user skip onboarding and reopen it later", async ({ page }) => {
    await registerUser(page, { onboarding: "stay" });
    await page.getByRole("button", { name: "Lewati" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByLabel("Nama bisnis")).toBeVisible();

    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings$/);
  });

  test("keeps users with unfinished onboarding on /onboarding", async ({ page }) => {
    await registerUser(page, { onboarding: "stay" });
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/onboarding$/);
  });
});

test.describe("clients", () => {
  test("creates, searches and archives a client", async ({ page }) => {
    await registerUser(page);
    await page.goto("/clients");
    await expect(page.getByText("Belum ada klien")).toBeVisible();

    const rows = page.getByRole("row");
    for (const [name, email] of [
      ["Acme Inc", "billing@acme.com"],
      ["Budi Studio", "budi@example.com"],
    ]) {
      await page.getByRole("link", { name: "Klien baru" }).first().click();
      await expect(page).toHaveURL(/\/clients\/new$/);
      await page.getByLabel("Nama", { exact: true }).fill(name);
      await page.getByLabel("Email", { exact: true }).fill(email);
      if (name === "Acme Inc") {
        await page.getByLabel("Mata uang default").click();
        await page.getByRole("option", { name: "USD" }).click();
        await page.getByLabel("Bahasa invoice").click();
        await page.getByRole("option", { name: "English" }).click();
      }
      await page.getByRole("button", { name: "Simpan" }).click();
      await expect(page).toHaveURL(/\/clients$/);
    }

    // Two clients plus the header row.
    await expect(rows).toHaveCount(3);
    const acme = rows.filter({ hasText: "Acme Inc" });
    await expect(acme).toContainText("billing@acme.com");
    await expect(acme).toContainText("USD");
    await expect(acme).toContainText("English");

    await page.getByLabel("Cari klien").fill("acme");
    await page.getByLabel("Cari klien").press("Enter");
    await expect(page).toHaveURL(/q=acme/);
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Budi Studio" })).toHaveCount(0);

    await page.getByRole("link", { name: "Acme Inc" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Acme Inc");
    await page.getByRole("button", { name: "Arsipkan" }).click();
    await expect(page.getByRole("button", { name: "Pulihkan" })).toBeVisible();

    await page.goto("/clients");
    await expect(page.getByRole("link", { name: "Acme Inc" })).toHaveCount(0);
    await page.getByRole("link", { name: "Arsip", exact: true }).click();
    await expect(page.getByRole("link", { name: "Acme Inc" })).toBeVisible();
  });

  test("shows validation errors and 404s for an unknown client", async ({ page }) => {
    await registerUser(page);
    await page.goto("/clients/new");
    await page.getByLabel("Email", { exact: true }).fill("bukan-email");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Wajib diisi.")).toBeVisible();
    await expect(page.getByText("Format email tidak valid.")).toBeVisible();

    await page.goto("/clients/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("Halaman tidak ditemukan")).toBeVisible();
  });
});
