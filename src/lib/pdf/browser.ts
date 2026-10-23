import chromium from "@sparticuz/chromium-min";
import puppeteer, { type Browser } from "puppeteer-core";

/**
 * The compressed Chromium for serverless, fetched on a cold start and kept in /tmp for the life of
 * the function instance, so the deployment itself ships no browser. Its version must match the
 * installed @sparticuz/chromium-min (and puppeteer-core's Chrome 153); CHROMIUM_PACK_URL overrides
 * it, e.g. to serve the pack from your own storage.
 */
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ??
  "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar";

/**
 * Starts headless Chromium: the @sparticuz/chromium-min build on Vercel (a chrome-headless-shell
 * binary, so `headless: "shell"` as its README documents), otherwise the binary named by
 * CHROMIUM_PATH. The caller must close the browser.
 */
export async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
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
