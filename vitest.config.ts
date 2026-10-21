import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "src") };

// Picks up .env.local / .env (git-ignored) so TEST_DATABASE_URL is available
// to the integration project without exporting it by hand.
const fileEnv = loadEnv("test", import.meta.dirname, "");
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  fileEnv.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/invoice_test";

// Read by globalSetup (main process) and by the test workers.
process.env.TEST_DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          fileParallelism: false,
          globalSetup: ["tests/integration/global-setup.ts"],
          // App code under test (`db` from src/db/client.ts) must hit the test DB.
          env: { DATABASE_URL: testDatabaseUrl },
        },
      },
    ],
  },
});
