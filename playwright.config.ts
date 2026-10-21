import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/invoice_test";
const dbName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
if (!/test/i.test(dbName)) {
  throw new Error(`Refusing to run e2e against "${dbName}": database name must contain "test"`);
}

const chromiumPath = process.env.CHROMIUM_PATH;

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
    command: `npx drizzle-kit migrate && npm run build && npm run start -- -p ${PORT}`,
    port: PORT,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: testDatabaseUrl,
      BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789",
      BETTER_AUTH_URL: BASE_URL,
      AUTH_RATE_LIMIT_DISABLED: "true",
    },
  },
});
