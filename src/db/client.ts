import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Keep one connection pool across HMR reloads in dev.
const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

function createClient(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return postgres(url, { onnotice: () => {} });
}

const client = globalForDb.pgClient ?? createClient();
if (process.env.NODE_ENV !== "production") {
  globalForDb.pgClient = client;
}

export const db = drizzle(client, { schema });
