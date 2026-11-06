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

function ownedBy(workspaceId: string, id: string) {
  return and(eq(paymentAccounts.id, id), eq(paymentAccounts.workspaceId, workspaceId));
}

async function findOwned(tx: Pick<Tx, "select">, workspaceId: string, id: string): Promise<PaymentAccount> {
  if (!UUID_RE.test(id)) throw new NotFoundError("Payment account not found");
  const [row] = await tx.select().from(paymentAccounts).where(ownedBy(workspaceId, id)).limit(1);
  if (!row) throw new NotFoundError("Payment account not found");
  return row;
}

/** An archived account can never be the default. */
function assertActive(account: PaymentAccount) {
  if (account.archivedAt) throw new ValidationError({ isDefault: ["invalidValue"] });
}

async function clearDefault(tx: Tx, workspaceId: string) {
  await tx
    .update(paymentAccounts)
    .set({ isDefault: false })
    .where(and(eq(paymentAccounts.workspaceId, workspaceId), eq(paymentAccounts.isDefault, true)));
}

export async function listPaymentAccounts(
  workspaceId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<PaymentAccount[]> {
  return db
    .select()
    .from(paymentAccounts)
    .where(
      includeArchived
        ? eq(paymentAccounts.workspaceId, workspaceId)
        : and(eq(paymentAccounts.workspaceId, workspaceId), isNull(paymentAccounts.archivedAt)),
    )
    .orderBy(desc(paymentAccounts.isDefault), asc(paymentAccounts.createdAt));
}

export async function getPaymentAccount(workspaceId: string, id: string): Promise<PaymentAccount> {
  return findOwned(db, workspaceId, id);
}

export async function createPaymentAccount(workspaceId: string, input: unknown): Promise<PaymentAccount> {
  const row = toRow(parseInput(paymentAccountSchema, input));
  return db.transaction(async (tx) => {
    if (row.isDefault) await clearDefault(tx, workspaceId);
    const [created] = await tx
      .insert(paymentAccounts)
      .values({ ...row, workspaceId })
      .returning();
    return created;
  });
}

export async function updatePaymentAccount(
  workspaceId: string,
  id: string,
  input: unknown,
): Promise<PaymentAccount> {
  const row = toRow(parseInput(paymentAccountSchema, input));
  return db.transaction(async (tx) => {
    const existing = await findOwned(tx, workspaceId, id);
    if (row.isDefault) {
      assertActive(existing);
      await clearDefault(tx, workspaceId);
    }
    const [updated] = await tx.update(paymentAccounts).set(row).where(ownedBy(workspaceId, id)).returning();
    return updated;
  });
}

export async function setDefaultPaymentAccount(workspaceId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    assertActive(await findOwned(tx, workspaceId, id));
    await clearDefault(tx, workspaceId);
    await tx.update(paymentAccounts).set({ isDefault: true }).where(ownedBy(workspaceId, id));
  });
}

/** Archiving also drops the default flag, so an archived account is never the default. */
export async function archivePaymentAccount(workspaceId: string, id: string): Promise<void> {
  await findOwned(db, workspaceId, id);
  await db
    .update(paymentAccounts)
    .set({ archivedAt: new Date(), isDefault: false })
    .where(ownedBy(workspaceId, id));
}

export async function restorePaymentAccount(workspaceId: string, id: string): Promise<void> {
  await findOwned(db, workspaceId, id);
  await db.update(paymentAccounts).set({ archivedAt: null }).where(ownedBy(workspaceId, id));
}
