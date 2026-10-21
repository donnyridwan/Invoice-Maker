import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { paymentAccounts } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";
import { parseInput, UUID_RE } from "@/lib/validate";
import { paymentAccountSchema, type PaymentAccountInput } from "./schema";

export type PaymentAccount = typeof paymentAccounts.$inferSelect;

const DEFAULT_CURRENCY = "IDR";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function toRow(input: PaymentAccountInput) {
  const { type, label, currency, isDefault, ...rest } = input;
  const details: Record<string, string> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (typeof value === "string" && value !== "") details[key] = value;
  }
  return { type, label: label ?? "", currency: currency ?? DEFAULT_CURRENCY, isDefault, details };
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

export async function hasActivePaymentAccount(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: paymentAccounts.id })
    .from(paymentAccounts)
    .where(and(eq(paymentAccounts.userId, userId), isNull(paymentAccounts.archivedAt)))
    .limit(1);
  return Boolean(row);
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
    await findOwned(tx, userId, id);
    if (row.isDefault) await clearDefault(tx, userId);
    const [updated] = await tx.update(paymentAccounts).set(row).where(ownedBy(userId, id)).returning();
    return updated;
  });
}

export async function setDefaultPaymentAccount(userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await findOwned(tx, userId, id);
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
