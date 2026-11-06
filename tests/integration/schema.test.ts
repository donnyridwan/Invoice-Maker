import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { clients, user, workspaceMembers, workspaces } from "@/db/schema";
import { createTestUser, resetDb, testDb } from "./helpers";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("schema", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("inserts a client with defaults", async () => {
    const owner = await createTestUser();
    await testDb.insert(clients).values({ workspaceId: owner.id, name: "Budi" });

    const rows = await testDb.select().from(clients).where(eq(clients.workspaceId, owner.id));

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Budi");
    expect(rows[0].archivedAt).toBeNull();
    expect(rows[0].id).toMatch(UUID_RE);
  });

  it("deletes a workspace's clients when the workspace is deleted (cascade)", async () => {
    const owner = await createTestUser();
    await testDb.insert(clients).values({ workspaceId: owner.id, name: "Budi" });

    await testDb.delete(workspaces).where(eq(workspaces.id, owner.id));

    expect(await testDb.select().from(clients)).toHaveLength(0);
  });

  it("keeps a workspace and its data when a member's account is deleted", async () => {
    const owner = await createTestUser();
    await testDb.insert(clients).values({ workspaceId: owner.id, name: "Budi" });

    await testDb.delete(user).where(eq(user.id, owner.id));

    expect(await testDb.select().from(clients)).toHaveLength(1);
    expect(await testDb.select().from(workspaceMembers)).toHaveLength(0);
  });
});
