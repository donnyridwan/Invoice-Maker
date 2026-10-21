import { expect, test } from "@playwright/test";
import { clearOutbox, firstLink, readOutbox, registerUser } from "./helpers";

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
