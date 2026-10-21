import type { Browser } from "puppeteer-core";
import { signPrintPath } from "@/lib/signed-url";
import { printBaseUrl, printBypassHeader } from "./base-url";
import { launchBrowser } from "./browser";
import { withDeadline } from "./deadline";

/** A4 at 96 dpi: 210 mm x 297 mm. The viewport is that wide so the page lays out like the preview. */
const A4_VIEWPORT = { width: 794, height: 1123 };

/** The whole render (launch, load, print) must end inside the 30 s function limit. */
const RENDER_DEADLINE_MS = 25_000;
const CLOSE_GRACE_MS = 3_000;

/** Closes the browser; a failing or hanging close kills the process instead and never throws. */
async function closeQuietly(browser: Browser): Promise<void> {
  try {
    await withDeadline(browser.close(), CLOSE_GRACE_MS, "Closing the browser timed out");
  } catch (e) {
    console.error(e);
    try {
      browser.process()?.kill("SIGKILL");
    } catch {
      // Nothing more to do.
    }
  }
}

/**
 * Renders an invoice to a PDF by opening its signed print page in headless Chromium. The caller
 * has already checked that the invoice may be seen; this only turns the id into bytes. Gives up
 * after 25 s.
 */
export async function renderInvoicePdf(invoiceId: string): Promise<Uint8Array> {
  let browser: Browser | undefined;
  let expired = false;

  const work = (async () => {
    const launched = await launchBrowser();
    browser = launched;
    // The deadline passed while launching: nobody waits for this browser any more.
    if (expired) {
      await closeQuietly(launched);
      throw new Error("PDF rendering was abandoned");
    }

    const baseUrl = printBaseUrl();
    const bypass = printBypassHeader();
    const page = await launched.newPage();
    await page.setViewport(A4_VIEWPORT);
    if (bypass) {
      // Deployment Protection: the app's own origin gets the bypass header, other hosts (logo
      // storage, fonts) never see the secret.
      const origin = new URL(baseUrl).origin;
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        if (request.isInterceptResolutionHandled()) return;
        const sameOrigin = new URL(request.url()).origin === origin;
        void request.continue(sameOrigin ? { headers: { ...request.headers(), ...bypass } } : {});
      });
    }

    const response = await page.goto(`${baseUrl}${signPrintPath(invoiceId)}`, {
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
  })();
  // If the deadline wins, `work` may still reject later; that must not become an unhandled rejection.
  work.catch(() => {});

  try {
    return await withDeadline(work, RENDER_DEADLINE_MS, `Rendering the PDF of invoice ${invoiceId} timed out`);
  } finally {
    expired = true;
    if (browser) await closeQuietly(browser);
  }
}
