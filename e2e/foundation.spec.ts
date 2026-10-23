import { expect, test } from "@playwright/test";
import { EDITOR_URL_RE, registerUser } from "./helpers";

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

  test("clears a stale session cookie so /register stays reachable", async ({ page, context }) => {
    await context.addCookies([
      { name: "better-auth.session_token", value: "stale.invalid", url: "http://localhost:3100" },
    ]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?(next=.*&)?expired=1/);
    await expect(page.getByRole("button", { name: "Masuk" })).toBeVisible();

    await expect
      .poll(async () => (await context.cookies()).some((c) => c.name.includes("session_token") && c.value === "stale.invalid"))
      .toBe(false);
    await page.getByRole("link", { name: "Daftar" }).click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test("redirects a signed-in user from /login?expired=1 without signing them out", async ({ page }) => {
    await registerUser(page);
    await page.goto("/login?expired=1");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Halo, Donny");
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

  test("keeps the 14px type scale and spec dimensions", async ({ page }) => {
    await registerUser(page);
    await page.goto("/clients");

    const px = (selector: string, property: string) =>
      page.locator(selector).first().evaluate((el, prop) => parseFloat(getComputedStyle(el)[prop as never]), property);
    expect(await px("body", "fontSize")).toBe(14);
    expect(await px("h1", "fontSize")).toBe(24);
    expect(await px("aside", "width")).toBe(70);

    await page.getByRole("link", { name: "Klien baru" }).first().click();
    await page.getByLabel("Nama", { exact: true }).fill("Dimensi");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page).toHaveURL(/\/clients$/);
    expect(await px("tbody tr", "height")).toBe(48);
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
  test("saves the business name, then completes the profile from settings", async ({ page }) => {
    await registerUser(page, { onboarding: "stay" });
    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole("link", { name: "Klien" })).toHaveCount(0);

    await page.getByLabel("Nama bisnis").fill("Studio Donny");
    await page.getByRole("button", { name: "Lanjut" }).click();
    await expect(page).toHaveURL(EDITOR_URL_RE);

    await page.goto("/settings");
    await expect(page.getByLabel("Nama bisnis")).toHaveValue("Studio Donny");
    const profileCard = page.getByRole("region", { name: "Profil bisnis" });
    await profileCard.getByLabel("Alamat").fill("Jl. Sudirman No. 1, Jakarta");
    await profileCard.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Tersimpan")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("region", { name: "Profil bisnis" }).getByLabel("Alamat")).toHaveValue(
      "Jl. Sudirman No. 1, Jakarta",
    );
  });

  test("creates a first bank account during onboarding", async ({ page }) => {
    await registerUser(page, { onboarding: "stay" });

    await page.getByRole("button", { name: "Tambah rekening" }).click();
    await page.getByLabel("Nama bank").fill("BCA");
    await page.getByLabel("Nama pemilik rekening").fill("Donny");
    await page.getByLabel("Nomor rekening").fill("1234567890");
    await page.getByRole("button", { name: "Lanjut" }).click();
    await expect(page).toHaveURL(EDITOR_URL_RE);
    await page.goto("/settings/payment-accounts");
    await expect(page.getByText("BCA").first()).toBeVisible();

    await page.goto("/settings/payment-accounts");
    await expect(page.getByRole("listitem").filter({ hasText: "BCA" })).toContainText("Default");
  });

  test("lets a new user skip onboarding and reopen it later", async ({ page }) => {
    await registerUser(page, { onboarding: "stay" });
    await page.getByRole("button", { name: "Lewati" }).click();
    await expect(page).toHaveURL(EDITOR_URL_RE);

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

test.describe("catalog", () => {
  test("adds an item with an Indonesian price and rejects an invalid edit", async ({ page }) => {
    await registerUser(page);
    await page.goto("/catalog");
    await expect(page.getByText("Katalog masih kosong")).toBeVisible();

    await page.getByRole("button", { name: "Item baru" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nama", { exact: true }).fill("Desain logo");
    await dialog.getByLabel("Satuan", { exact: true }).fill("proyek");
    await dialog.getByLabel("Harga satuan").fill("1.500.000");
    await expect(dialog.getByLabel("Mata uang")).toContainText("IDR");
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(dialog).toHaveCount(0);

    const row = page.getByRole("row").filter({ hasText: "Desain logo" });
    await expect(row).toContainText("proyek");
    // Intl puts a no-break space between "Rp" and the amount.
    await expect(row.getByRole("cell").nth(2)).toHaveText(/^Rp\s1\.500\.000$/);
    expect(((await row.getByRole("cell").nth(2).textContent()) ?? "").replace(/ /g, " ")).toBe("Rp 1.500.000");

    await row.getByRole("button", { name: "Aksi" }).click();
    await page.getByRole("menuitem", { name: "Ubah" }).click();
    const edit = page.getByRole("dialog");
    await expect(edit.getByLabel("Harga satuan")).toHaveValue("1.500.000");
    await edit.getByLabel("Harga satuan").fill("abc");
    await edit.getByRole("button", { name: "Simpan" }).click();
    await expect(edit.getByText("Jumlah tidak valid")).toBeVisible();

    await edit.getByLabel("Harga satuan").fill("2.000.000");
    await edit.getByRole("button", { name: "Simpan" }).click();
    await expect(edit).toHaveCount(0);
    await expect(row.getByRole("cell").nth(2)).toHaveText(/^Rp\s2\.000\.000$/);
  });

  test("archives and restores an item", async ({ page }) => {
    await registerUser(page);
    await page.goto("/catalog");
    await page.getByRole("button", { name: "Item baru" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nama", { exact: true }).fill("Hosting");
    await dialog.getByLabel("Harga satuan").fill("250.000");
    await dialog.getByRole("button", { name: "Simpan" }).click();

    const row = page.getByRole("row").filter({ hasText: "Hosting" });
    await row.getByRole("button", { name: "Aksi" }).click();
    await page.getByRole("menuitem", { name: "Arsipkan" }).click();
    await expect(page.getByText("Katalog masih kosong")).toBeVisible();

    await page.getByRole("link", { name: "Arsip", exact: true }).click();
    await row.getByRole("button", { name: "Aksi" }).click();
    await page.getByRole("menuitem", { name: "Pulihkan" }).click();
    await expect(page.getByText("Belum ada item yang diarsipkan")).toBeVisible();
  });
});

// 1x1 transparent PNG.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("logo", () => {
  test("uploads a logo, shows it and removes it again", async ({ page }) => {
    await registerUser(page);
    await page.goto("/settings");

    const card = page.getByRole("region", { name: "Logo" });
    await expect(card.getByText("JPG, PNG, atau WebP, maks. 2 MB")).toBeVisible();
    await expect(card.getByRole("img")).toHaveCount(0);

    await card.locator("input[type=file]").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG_1X1 });
    const logo = card.getByRole("img", { name: "Logo bisnis" });
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute("src", /^\/uploads\/logo\/[0-9a-f-]{36}\.png$/);
    await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(card.getByRole("button", { name: "Ganti" })).toBeVisible();

    // Removing only clears the profile field: invoices keep a snapshot of the logo URL, so the
    // file itself must stay available.
    const src = (await logo.getAttribute("src"))!;
    await card.getByRole("button", { name: "Hapus" }).click();
    await expect(card.getByRole("img")).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Unggah logo" })).toBeVisible();
    expect((await page.request.get(src)).status()).toBe(200);
  });

  test("keeps the previous logo file when the logo is replaced", async ({ page }) => {
    await registerUser(page);
    await page.goto("/settings");

    const card = page.getByRole("region", { name: "Logo" });
    const input = card.locator("input[type=file]");
    await input.setInputFiles({ name: "one.png", mimeType: "image/png", buffer: PNG_1X1 });
    const logo = card.getByRole("img", { name: "Logo bisnis" });
    await expect(logo).toBeVisible();
    const first = (await logo.getAttribute("src"))!;

    await input.setInputFiles({ name: "two.png", mimeType: "image/png", buffer: PNG_1X1 });
    await expect(logo).not.toHaveAttribute("src", first);
    expect((await page.request.get(first)).status()).toBe(200);
  });

  test("rejects a file that is not a real image", async ({ page }) => {
    await registerUser(page);
    await page.goto("/settings");

    const card = page.getByRole("region", { name: "Logo" });
    await card
      .locator("input[type=file]")
      .setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<html><script>1</script></html>") });
    await expect(card.getByRole("alert")).toHaveText("Format file tidak didukung");
    await expect(card.getByRole("img")).toHaveCount(0);
  });
});
