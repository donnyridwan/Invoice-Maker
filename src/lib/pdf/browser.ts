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
 * The unpacked binary's path, unpacked once per function instance. chromium-min treats
 * /tmp/chromium as ready as soon as it exists, so a second request on a cold instance would
 * otherwise spawn the binary while the first is still writing it (spawn ETXTBSY).
 */
let executablePathPromise: Promise<string> | null = null;

function serverlessExecutablePath(): Promise<string> {
  executablePathPromise ??= chromium
    .executablePath(CHROMIUM_PACK_URL)
    .catch((error: unknown) => {
      executablePathPromise = null;
      throw error;
    });
  return executablePathPromise;
}

function isTextFileBusy(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === "ETXTBSY"
  );
}

/**
 * Starts headless Chromium: the @sparticuz/chromium-min build on Vercel (a chrome-headless-shell
 * binary, so `headless: "shell"` as its README documents), otherwise the binary named by
 * CHROMIUM_PATH. The caller must close the browser.
 */
export async function launchBrowser(): Promise<Browser> {
  if (process.env.VERCEL) {
    const launch = async () =>
      puppeteer.launch({
        args: chromium.args,
        executablePath: await serverlessExecutablePath(),
        headless: "shell",
      });
    try {
      return await launch();
    } catch (error) {
      // Another bundle on this instance may still be writing the binary: give it a moment, once.
      if (!isTextFileBusy(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return launch();
    }
  }

  const executablePath = process.env.CHROMIUM_PATH;
  if (!executablePath) {
    throw new Error(
      "CHROMIUM_PATH is not set; point it at a local Chromium/Chrome binary to render PDFs",
    );
  }
  return puppeteer.launch({
    executablePath,
    headless: true,
    // Containers and CI run as root without the user namespaces Chromium's sandbox needs.
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
}
