import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { clients, user } from "@/db/schema";
import { createTestUser, resetDb, testDb } from "./helpers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("schema", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("inserts a client with defaults", async () => {
    const owner = await createTestUser();
    await testDb.insert(clients).values({ userId: owner.id, name: "Budi" });

    const rows = await testDb.select().from(clients).where(eq(clients.userId, owner.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Budi");
    expect(rows[0].archivedAt).toBeNull();
    expect(rows[0].id).toMatch(UUID_RE);
  });

  it("deletes a user's clients when the user is deleted (cascade)", async () => {
    const owner = await createTestUser();
    await testDb.insert(clients).values({ userId: owner.id, name: "Budi" });

    await testDb.delete(user).where(eq(user.id, owner.id));

    expect(await testDb.select().from(clients)).toHaveLength(0);
  });
});
