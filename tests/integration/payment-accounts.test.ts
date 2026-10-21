import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { paymentAccounts } from "@/db/schema";
import {
  archivePaymentAccount,
  createPaymentAccount,
  getPaymentAccount,
  hasActivePaymentAccount,
  listPaymentAccounts,
  restorePaymentAccount,
  setDefaultPaymentAccount,
  updatePaymentAccount,
} from "@/features/payment-accounts/queries";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createTestUser, resetDb, testDb } from "./helpers";

const bank = (overrides: Record<string, unknown> = {}) => ({
  type: "bank" as const,
  bankName: "BCA",
  accountName: "Donny",
  accountNumber: "1234567890",
  isDefault: false,
  ...overrides,
});

describe("payment accounts", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("keeps a single default account per user", async () => {
    const u = await createTestUser();
    const other = await createTestUser();
    const first = await createPaymentAccount(u.id, bank({ isDefault: true }));
    const otherUsers = await createPaymentAccount(other.id, bank({ isDefault: true }));
    const second = await createPaymentAccount(u.id, bank({ bankName: "Mandiri", isDefault: true }));

    expect((await getPaymentAccount(u.id, first.id)).isDefault).toBe(false);
    expect((await getPaymentAccount(u.id, second.id)).isDefault).toBe(true);
    expect((await getPaymentAccount(other.id, otherUsers.id)).isDefault).toBe(true);

    await setDefaultPaymentAccount(u.id, first.id);
    expect((await listPaymentAccounts(u.id)).map((a) => [a.id, a.isDefault])).toEqual([
      [first.id, true],
      [second.id, false],
    ]);
  });

  it("stores the type-specific details and the currency", async () => {
    const u = await createTestUser();
    const created = await createPaymentAccount(u.id, {
      type: "paypal",
      email: "pay@donny.com",
      currency: "USD",
      label: "PayPal USD",
      isDefault: false,
    });
    expect(created).toMatchObject({
      type: "paypal",
      label: "PayPal USD",
      currency: "USD",
      details: { email: "pay@donny.com" },
      archivedAt: null,
    });
  });

  it("treats a missing currency as 'any currency' (null)", async () => {
    const u = await createTestUser();
    const created = await createPaymentAccount(u.id, bank());
    expect(created.currency).toBeNull();
    const updated = await updatePaymentAccount(u.id, created.id, bank({ currency: "USD" }));
    expect(updated.currency).toBe("USD");
    expect((await updatePaymentAccount(u.id, created.id, bank({ currency: "" }))).currency).toBeNull();
  });

  it("never makes an archived account the default", async () => {
    const u = await createTestUser();
    const active = await createPaymentAccount(u.id, bank({ isDefault: true }));
    const archived = await createPaymentAccount(u.id, bank({ bankName: "Mandiri" }));
    await archivePaymentAccount(u.id, archived.id);

    await expect(setDefaultPaymentAccount(u.id, archived.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(
      updatePaymentAccount(u.id, archived.id, bank({ bankName: "Mandiri", isDefault: true })),
    ).rejects.toBeInstanceOf(ValidationError);

    expect((await getPaymentAccount(u.id, active.id)).isDefault).toBe(true);
    expect((await getPaymentAccount(u.id, archived.id)).isDefault).toBe(false);
  });

  it("enforces one active default per user in the database", async () => {
    const u = await createTestUser();
    const a = await createPaymentAccount(u.id, bank({ isDefault: true }));
    const b = await createPaymentAccount(u.id, bank({ bankName: "Mandiri" }));
    await expect(
      testDb.update(paymentAccounts).set({ isDefault: true }).where(eq(paymentAccounts.id, b.id)),
    ).rejects.toThrow();
    // An archived default does not count.
    await archivePaymentAccount(u.id, a.id);
    await testDb.update(paymentAccounts).set({ isDefault: true, archivedAt: new Date() }).where(eq(paymentAccounts.id, a.id));
    await testDb.update(paymentAccounts).set({ isDefault: true }).where(eq(paymentAccounts.id, b.id));
  });

  it("rejects a SWIFT account without account number or IBAN", async () => {
    const u = await createTestUser();
    const swift = { type: "swift", bankName: "DBS", accountName: "Donny", swift: "DBSSSGSG", isDefault: false };

    await expect(createPaymentAccount(u.id, swift)).rejects.toBeInstanceOf(ValidationError);
    await expect(createPaymentAccount(u.id, { ...swift, iban: "SG1234567890" })).resolves.toMatchObject({
      type: "swift",
    });
  });

  it("rejects invalid input", async () => {
    const u = await createTestUser();
    await expect(createPaymentAccount(u.id, bank({ bankName: "" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createPaymentAccount(u.id, { type: "paypal", email: "nope", isDefault: false })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(createPaymentAccount(u.id, bank({ currency: "XXX" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(createPaymentAccount(u.id, bank({ accountName: "x".repeat(201) }))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("hides archived accounts unless asked, and restores them", async () => {
    const u = await createTestUser();
    const a = await createPaymentAccount(u.id, bank({ isDefault: true }));
    expect(await hasActivePaymentAccount(u.id)).toBe(true);

    await archivePaymentAccount(u.id, a.id);
    expect(await listPaymentAccounts(u.id)).toEqual([]);
    expect(await hasActivePaymentAccount(u.id)).toBe(false);
    const all = await listPaymentAccounts(u.id, { includeArchived: true });
    expect(all).toHaveLength(1);
    expect(all[0].archivedAt).toBeInstanceOf(Date);
    expect(all[0].isDefault).toBe(false);

    await restorePaymentAccount(u.id, a.id);
    expect(await listPaymentAccounts(u.id)).toHaveLength(1);
    expect(await hasActivePaymentAccount(u.id)).toBe(true);
  });

  it("updates an account", async () => {
    const u = await createTestUser();
    const a = await createPaymentAccount(u.id, bank());
    const updated = await updatePaymentAccount(u.id, a.id, bank({ bankName: "Mandiri", isDefault: true }));
    expect(updated.details).toMatchObject({ bankName: "Mandiri" });
    expect(updated.isDefault).toBe(true);
  });

  it("never lets another user read or change an account", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const owned = await createPaymentAccount(a.id, bank({ isDefault: true }));

    await expect(getPaymentAccount(b.id, owned.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updatePaymentAccount(b.id, owned.id, bank({ bankName: "Hacked" }))).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(archivePaymentAccount(b.id, owned.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(restorePaymentAccount(b.id, owned.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setDefaultPaymentAccount(b.id, owned.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPaymentAccount(a.id, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);

    expect(await listPaymentAccounts(b.id, { includeArchived: true })).toEqual([]);
    const after = await getPaymentAccount(a.id, owned.id);
    expect(after.details).toMatchObject({ bankName: "BCA" });
    expect(after.archivedAt).toBeNull();
    expect(after.isDefault).toBe(true);
  });
});
