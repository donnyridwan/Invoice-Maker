import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";

/**
 * Starts headless Chromium: the bundled @sparticuz/chromium build on Vercel (a chrome-headless-shell
 * binary, so `headless: "shell"` as its README documents), otherwise the binary named by
 * CHROMIUM_PATH. The caller must close the browser.
 */
export async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: "shell",
    });
  }

  const executablePath = process.env.CHROMIUM_PATH;
  if (!executablePath) {
    throw new Error("CHROMIUM_PATH is not set; point it at a local Chromium/Chrome binary to render PDFs");
  }
  return puppeteer.launch({
    executablePath,
    headless: true,
    // Containers and CI run as root without the user namespaces Chromium's sandbox needs.
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
}
