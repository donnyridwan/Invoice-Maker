import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

// e2e has its own database so it never collides with the integration tests (which TRUNCATE
// invoice_test) when both are run at the same time.
const e2eDatabaseUrl =
  process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/invoice_e2e";
const dbName = new URL(e2eDatabaseUrl).pathname.replace(/^\//, "");
if (!/e2e|test/i.test(dbName) || dbName === "invoice_test") {
  throw new Error(`Refusing to run e2e against "${dbName}": use a dedicated database whose name contains "e2e"`);
}

const chromiumPath = process.env.CHROMIUM_PATH;

// The server signs print URLs with this; specs read it from process.env to forge expired ones.
process.env.PRINT_SECRET ??= "e2e-print-secret-e2e-print-secret";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run db:migrate && npm run build && npm run start -- -p ${PORT}`,
    port: PORT,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
      BETTER_AUTH_URL: BASE_URL,
      AUTH_RATE_LIMIT_DISABLED: "true",
      // PDF rendering: the server opens its own signed print page with headless Chromium.
      APP_URL: BASE_URL,
      PRINT_SECRET: process.env.PRINT_SECRET,
      ...(chromiumPath ? { CHROMIUM_PATH: chromiumPath } : {}),
    },
  },
});
