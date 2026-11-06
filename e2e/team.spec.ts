import { expect, test } from "@playwright/test";
import { createInvoiceViaUi, registerUser } from "./helpers";

test.describe("team", () => {
  test("a new account waits until an owner adds it, then sees only that business", async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const financeContext = await browser.newContext();
    const owner = await ownerContext.newPage();
    const finance = await financeContext.newPage();

    // The owner runs two businesses, with an invoice in each.
    await registerUser(owner, { name: "Donny", businessName: "Bisnis A" });
    await createInvoiceViaUi(owner);
    await owner.goto("/dashboard");
    await owner.getByRole("button", { name: /^Ganti bisnis/ }).click();
    await owner.getByRole("menuitem", { name: "Bisnis baru" }).click();
    await owner.getByLabel("Nama bisnis").fill("Bisnis B");
    await owner.getByRole("button", { name: "Buat bisnis" }).click();
    await expect(owner).toHaveURL(/\/onboarding$/);
    await owner.getByRole("button", { name: "Lewati" }).click();
    await owner.goto("/invoices");
    await expect(owner.getByRole("row")).toHaveCount(2);
    const invoiceOfB = (await owner.getByRole("row").nth(1).innerText()).match(/INV-\d{4}-\d{3}/)?.[0];

    // A finance person signs up: no business yet, so the app waits.
    const { email } = await registerUser(finance, { name: "Rina", onboarding: "waiting" });
    await expect(finance.getByRole("heading", { name: "Menunggu akses" })).toBeVisible();
    await expect(finance.getByText(email)).toBeVisible();
    await finance.goto("/invoices");
    await expect(finance).toHaveURL(/\/waiting$/);

    // The owner adds them to Bisnis A only.
    await owner.getByRole("button", { name: /^Ganti bisnis/ }).click();
    await owner.getByRole("menuitem", { name: /Bisnis A/ }).click();
    await expect(owner).toHaveURL(/\/dashboard$/);
    await owner.goto("/settings/team");
    await expect(owner.getByRole("heading", { level: 1, name: "Tim" })).toBeVisible();
    await owner.getByLabel("Email akun").fill("bukan-terdaftar@example.com");
    await owner.getByRole("button", { name: "Tambahkan" }).click();
    await expect(owner.getByText("Email ini belum terdaftar")).toBeVisible();
    await owner.getByLabel("Email akun").fill(email);
    await owner.getByRole("button", { name: "Tambahkan" }).click();
    await expect(owner.getByRole("table", { name: "Anggota tim" })).toContainText("Rina");

    // Finance gets in, and sees Bisnis A's invoice but nothing of Bisnis B.
    await finance.getByRole("button", { name: "Periksa lagi" }).click();
    await expect(finance).toHaveURL(/\/dashboard$/);
    await finance.goto("/invoices");
    await expect(finance.getByRole("row")).toHaveCount(2);
    await expect(finance.getByRole("row").nth(1)).not.toContainText(invoiceOfB ?? "-");
    await finance.getByRole("button", { name: /^Ganti bisnis/ }).click();
    await expect(finance.getByRole("menuitem", { name: /Bisnis A/ })).toBeVisible();
    await expect(finance.getByRole("menuitem", { name: /Bisnis B/ })).toHaveCount(0);
    await finance.keyboard.press("Escape");

    // Members see the team but cannot manage it.
    await finance.goto("/settings/team");
    await expect(finance.getByText("Hanya pemilik yang bisa menambah atau menghapus anggota.")).toBeVisible();
    await expect(finance.getByLabel("Email akun")).toHaveCount(0);

    // Once removed, they are back to waiting.
    await owner.reload();
    await owner.getByRole("button", { name: "Aksi untuk Rina" }).click();
    await owner.getByRole("menuitem", { name: "Hapus dari tim" }).click();
    await owner.getByRole("dialog").getByRole("button", { name: "Hapus dari tim" }).click();
    await expect(owner.getByRole("table", { name: "Anggota tim" })).not.toContainText("Rina");
    await finance.goto("/invoices");
    await expect(finance).toHaveURL(/\/waiting$/);

    await ownerContext.close();
    await financeContext.close();
  });
});
