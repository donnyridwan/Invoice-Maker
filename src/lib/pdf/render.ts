import { getAppUrl } from "@/lib/app-url";
import { signPrintPath } from "@/lib/signed-url";
import { launchBrowser } from "./browser";

/** A4 at 96 dpi: 210 mm x 297 mm. The viewport is that wide so the page lays out like the preview. */
const A4_VIEWPORT = { width: 794, height: 1123 };

/**
 * Renders an invoice to a PDF by opening its signed print page in headless Chromium. The caller
 * has already checked that the invoice may be seen; this only turns the id into bytes.
 */
export async function renderInvoicePdf(invoiceId: string): Promise<Uint8Array> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setViewport(A4_VIEWPORT);
    const response = await page.goto(`${getAppUrl()}${signPrintPath(invoiceId)}`, {
      waitUntil: "networkidle0",
      timeout: 20_000,
    });
    if (!response?.ok()) {
      throw new Error(`Print page answered ${response?.status() ?? "nothing"} for invoice ${invoiceId}`);
    }
    // Web fonts and the logo must be in before the page is printed, or the PDF differs from the preview.
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } finally {
    await browser.close();
  }
}
