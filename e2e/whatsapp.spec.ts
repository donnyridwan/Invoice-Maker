import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { fillNewInvoice, registerUser } from "./helpers";

/** Keeps every request to wa.me inside the test (nothing external loads) and records the URLs. */
async function captureWhatsApp(context: BrowserContext): Promise<string[]> {
  const urls: string[] = [];
  await context.route(/^https:\/\/wa\.me\//, async (route) => {
    urls.push(route.request().url());
    await route.abort();
  });
  return urls;
}

async function createClient(page: Page, phone: string) {
  await page.goto("/clients/new");
  await page.getByLabel("Nama", { exact: true }).fill("Acme Inc");
  if (phone) await page.getByLabel("Telepon").fill(phone);
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page).toHaveURL(/\/clients$/);
}

async function openSendMenu(page: Page) {
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
}

test.describe("share via WhatsApp", () => {
  test("opens wa.me with the client's number and the public link, and marks a draft sent", async ({ page, context }) => {
    const urls = await captureWhatsApp(context);
    await registerUser(page);
    await createClient(page, "0812 3456 7890");
    await fillNewInvoice(page);

    const popupPromise = context.waitForEvent("page");
    await openSendMenu(page);
    await page.getByRole("menuitem", { name: "WhatsApp" }).click();
    const popup = await popupPromise;
    // The window opens blank on click and is pointed at wa.me once the server action resolves.
    await expect.poll(() => urls.length).toBe(1);
    await popup.close();

    expect(urls[0].startsWith("https://wa.me/6281234567890?text=")).toBe(true);
    const text = new URL(urls[0]).searchParams.get("text") ?? "";
    expect(text).toMatch(/^Halo Acme Inc, berikut invoice INV-.+ dari Donny sebesar Rp\s?1\.500\.000, jatuh tempo .+\. Lihat & bayar di sini: http\S*\/i\/[\w-]{20,}$/);

    const titleRow = page.getByRole("heading", { level: 1, name: /^INV-/ }).locator("..");
    await expect(titleRow).toContainText("Terkirim");

    await page.getByRole("link", { name: "Lihat", exact: true }).click();
    await expect(page.getByRole("region", { name: "Aktivitas" })).toContainText("Dikirim lewat WhatsApp");

    // The detail page has the same menu; sharing again only logs the share.
    const again = context.waitForEvent("page");
    await openSendMenu(page);
    await expect(page.getByRole("menuitem", { name: "Tandai terkirim" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "WhatsApp" }).click();
    const secondPopup = await again;
    await expect.poll(() => urls.length).toBe(2);
    await secondPopup.close();
    await page.reload();
    await expect(page.getByRole("region", { name: "Aktivitas" })).toContainText("Dibagikan lewat WhatsApp");
  });

  test("opens wa.me without a number when the client has no phone", async ({ page, context }) => {
    const urls = await captureWhatsApp(context);
    await registerUser(page);
    await createClient(page, "");
    await fillNewInvoice(page);

    const popupPromise = context.waitForEvent("page");
    await openSendMenu(page);
    await page.getByRole("menuitem", { name: "WhatsApp" }).click();
    const popup = await popupPromise;
    await expect.poll(() => urls.length).toBe(1);
    await popup.close();

    expect(urls[0].startsWith("https://wa.me/?text=")).toBe(true);
  });
});
