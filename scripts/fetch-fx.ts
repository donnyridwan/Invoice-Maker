/**
 * Fetches the latest exchange rates from Frankfurter and stores them (`npm run fx:fetch`).
 * Uses DATABASE_URL (from the environment or .env.local), so it also seeds a fresh database
 * before the first daily cron run.
 */
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

async function main() {
  // Imported after the env is loaded: the db client reads DATABASE_URL on import.
  const { fetchLatestRates } = await import("../src/features/fx/fetch-rates");
  const { saveRates } = await import("../src/features/fx/queries");
  const { date, rates } = await fetchLatestRates();
  const saved = await saveRates(date, rates);
  console.log(`Saved ${saved} exchange rates for ${date}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
