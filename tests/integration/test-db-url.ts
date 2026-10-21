/**
 * Single source of the integration-test database URL. Refuses anything that
 * does not look like a dedicated test database so tests can never touch
 * invoice_dev (or production) by misconfiguration.
 */
export function getTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is not set");
  }
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to run integration tests against "${dbName}": database name must contain "test"`);
  }
  return url;
}
