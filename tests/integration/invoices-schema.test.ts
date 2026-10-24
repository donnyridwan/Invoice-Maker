import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { businessProfiles, clients, invoiceEvents, invoiceItems, invoices } from "@/db/schema";
import { createTestUser, resetDb, testDb } from "./helpers";

async function insertInvoice(userId: string, overrides: Partial<typeof invoices.$inferInsert> = {}) {
  const [row] = await testDb
    .insert(invoices)
    .values({
      userId,
      number: "INV-2026-001",
      currency: "IDR",
      language: "id",
      template: "highlight",
      accentColor: "#5850EC",
      issueDate: "2026-10-21",
      dueDate: "2026-11-04",
      businessSnapshot: { businessName: "Studio Donny" },
      publicToken: crypto.randomUUID(),
      ...overrides,
    })
    .returning();
  return row;
}

describe("invoice schema", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("inserts an invoice with defaults and two items, and cascades the delete", async () => {
    const owner = await createTestUser();
    const invoice = await insertInvoice(owner.id);

    expect(invoice.status).toBe("draft");
    expect(invoice.discountType).toBe("none");
    expect(invoice.discountValue).toBe(0);
    expect(invoice.totalMinor).toBe(0);
    expect(invoice.paymentAccountsSnapshot).toEqual([]);
    expect(invoice.clientSnapshot).toBeNull();
    expect(invoice.clientId).toBeNull();
    expect(invoice.sentAt).toBeNull();

    await testDb.insert(invoiceItems).values([
      { invoiceId: invoice.id, position: 0, name: "Desain logo", quantityMilli: 1000, unitPriceMinor: 1500000, amountMinor: 1500000 },
      { invoiceId: invoice.id, position: 1, name: "Revisi", quantityMilli: 2500, unitPriceMinor: 200000, amountMinor: 500000 },
    ]);
    await testDb.insert(invoiceEvents).values({ invoiceId: invoice.id, type: "created" });

    const items = await testDb.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
    expect(items).toHaveLength(2);
    const [event] = await testDb.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, invoice.id));
    expect(event.meta).toEqual({});

    await testDb.delete(invoices).where(eq(invoices.id, invoice.id));

    expect(await testDb.select().from(invoiceItems)).toHaveLength(0);
    expect(await testDb.select().from(invoiceEvents)).toHaveLength(0);
  });

  it("rejects a duplicate (userId, number) but allows it for another user", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    await insertInvoice(owner.id);

    await expect(insertInvoice(owner.id)).rejects.toThrow();
    await expect(insertInvoice(other.id)).resolves.toBeDefined();
  });

  it("sets clientId to null when the client is deleted", async () => {
    const owner = await createTestUser();
    const [client] = await testDb.insert(clients).values({ userId: owner.id, name: "Budi" }).returning();
    const invoice = await insertInvoice(owner.id, { clientId: client.id });
    expect(invoice.clientId).toBe(client.id);

    await testDb.delete(clients).where(eq(clients.id, client.id));

    const [after] = await testDb.select().from(invoices).where(eq(invoices.id, invoice.id));
    expect(after.clientId).toBeNull();
  });

  it("adds a nullable invoiceNumberYear to business profiles", async () => {
    const owner = await createTestUser();
    await testDb.insert(businessProfiles).values({ userId: owner.id });
    const [profile] = await testDb.select().from(businessProfiles).where(eq(businessProfiles.userId, owner.id));
    expect(profile.invoiceNumberYear).toBeNull();
  });
});
