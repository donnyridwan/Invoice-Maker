import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Headless Chromium for PDFs: native binaries / dynamic requires that must not be bundled.
  // The browser itself is not shipped: @sparticuz/chromium-min downloads it at runtime (lib/pdf/browser.ts).
  serverExternalPackages: ["@sparticuz/chromium-min", "puppeteer-core"],
  // Uploads (logo 2 MB, payment proof 5 MB) travel through server actions.
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
