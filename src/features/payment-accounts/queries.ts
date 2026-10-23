import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { paymentAccounts } from "@/db/schema";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseInput, UUID_RE } from "@/lib/validate";
import { paymentAccountSchema, type PaymentAccountInput } from "./schema";

export type PaymentAccount = typeof paymentAccounts.$inferSelect;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function toRow(input: PaymentAccountInput) {
  const { type, label, currency, isDefault, ...rest } = input;
  const details: Record<string, string> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (typeof value === "string" && value !== "") details[key] = value;
  }
  return { type, label: label ?? "", currency: currency ?? null, isDefault, details };
}

function ownedBy(userId: string, id: string) {
  return and(eq(paymentAccounts.id, id), eq(paymentAccounts.userId, userId));
}

async function findOwned(tx: Pick<Tx, "select">, userId: string, id: string): Promise<PaymentAccount> {
  if (!UUID_RE.test(id)) throw new NotFoundError("Payment account not found");
  const [row] = await tx.select().from(paymentAccounts).where(ownedBy(userId, id)).limit(1);
  if (!row) throw new NotFoundError("Payment account not found");
  return row;
}

/** An archived account can never be the default. */
function assertActive(account: PaymentAccount) {
  if (account.archivedAt) throw new ValidationError({ isDefault: ["invalidValue"] });
}

async function clearDefault(tx: Tx, userId: string) {
  await tx
    .update(paymentAccounts)
    .set({ isDefault: false })
    .where(and(eq(paymentAccounts.userId, userId), eq(paymentAccounts.isDefault, true)));
}

export async function listPaymentAccounts(
  userId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<PaymentAccount[]> {
  return db
    .select()
    .from(paymentAccounts)
    .where(
      includeArchived
        ? eq(paymentAccounts.userId, userId)
        : and(eq(paymentAccounts.userId, userId), isNull(paymentAccounts.archivedAt)),
    )
    .orderBy(desc(paymentAccounts.isDefault), asc(paymentAccounts.createdAt));
}

export async function getPaymentAccount(userId: string, id: string): Promise<PaymentAccount> {
  return findOwned(db, userId, id);
}

export async function createPaymentAccount(userId: string, input: unknown): Promise<PaymentAccount> {
  const row = toRow(parseInput(paymentAccountSchema, input));
  return db.transaction(async (tx) => {
    if (row.isDefault) await clearDefault(tx, userId);
    const [created] = await tx
      .insert(paymentAccounts)
      .values({ ...row, userId })
      .returning();
    return created;
  });
}

export async function updatePaymentAccount(
  userId: string,
  id: string,
  input: unknown,
): Promise<PaymentAccount> {
  const row = toRow(parseInput(paymentAccountSchema, input));
  return db.transaction(async (tx) => {
    const existing = await findOwned(tx, userId, id);
    if (row.isDefault) {
      assertActive(existing);
      await clearDefault(tx, userId);
    }
    const [updated] = await tx.update(paymentAccounts).set(row).where(ownedBy(userId, id)).returning();
    return updated;
  });
}

export async function setDefaultPaymentAccount(userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    assertActive(await findOwned(tx, userId, id));
    await clearDefault(tx, userId);
    await tx.update(paymentAccounts).set({ isDefault: true }).where(ownedBy(userId, id));
  });
}

/** Archiving also drops the default flag, so an archived account is never the default. */
export async function archivePaymentAccount(userId: string, id: string): Promise<void> {
  await findOwned(db, userId, id);
  await db
    .update(paymentAccounts)
    .set({ archivedAt: new Date(), isDefault: false })
    .where(ownedBy(userId, id));
}

export async function restorePaymentAccount(userId: string, id: string): Promise<void> {
  await findOwned(db, userId, id);
  await db.update(paymentAccounts).set({ archivedAt: null }).where(ownedBy(userId, id));
}
