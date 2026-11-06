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

/**
 * A user who owns a workspace of their own. The workspace shares the user's id (a UUID), so a test
 * can pass `user.id` wherever a query wants the workspace id. Pass `workspace: false` for a user
 * who belongs to no workspace.
 */
export async function createTestUser(
  overrides: Partial<typeof schema.user.$inferInsert> & { workspace?: boolean } = {},
): Promise<{ id: string; email: string }> {
  const { workspace = true, ...fields } = overrides;
  const id = fields.id ?? randomUUID();
  const email = fields.email ?? `${id}@example.test`;
  await testDb.insert(schema.user).values({
    name: "Test User",
    ...fields,
    id,
    email,
  });
  if (workspace) {
    await testDb.insert(schema.workspaces).values({ id, name: fields.name ?? "Test User" });
    await testDb.insert(schema.workspaceMembers).values({ workspaceId: id, userId: id, role: "owner" });
  }
  return { id, email };
}
