import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Headless Chromium for PDFs: native binaries / dynamic requires that must not be bundled.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // @sparticuz/chromium reads its compressed browser from bin/ at runtime, which file tracing
  // cannot see. Ship it with every route that renders a PDF (downloads, email sends, cron).
  outputFileTracingIncludes: {
    "/api/invoices/**": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/cron/**": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/i/**": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/invoices/**": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
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
