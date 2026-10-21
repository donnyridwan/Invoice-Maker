import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { getTestDatabaseUrl } from "./test-db-url";

const client = postgres(getTestDatabaseUrl(), { max: 5, onnotice: () => {} });

export const testDb = drizzle(client, { schema });

export async function resetDb(): Promise<void> {
  const rows = await testDb.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  await testDb.execute(sql.raw(`TRUNCATE TABLE ${names} CASCADE`));
}

export async function createTestUser(
  overrides: Partial<typeof schema.user.$inferInsert> = {},
): Promise<{ id: string; email: string }> {
  const id = overrides.id ?? randomUUID();
  const email = overrides.email ?? `${id}@example.test`;
  await testDb.insert(schema.user).values({
    name: "Test User",
    ...overrides,
    id,
    email,
  });
  return { id, email };
}
