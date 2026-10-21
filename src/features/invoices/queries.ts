import { randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gt, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, clients, invoiceEvents, invoiceItems, invoices, paymentAccounts } from "@/db/schema";
import { getClient } from "@/features/clients/queries";
import { listPaymentAccounts } from "@/features/payment-accounts/queries";
import type { BusinessProfile } from "@/features/profile/queries";
import { addDays, daysBetween, todayInJakarta } from "@/lib/dates";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { calcTotals } from "@/lib/invoice-calc";
import { allocateInvoiceNumber } from "@/lib/numbering";
import { likePattern } from "@/lib/sql";
import { parseInput, UUID_RE } from "@/lib/validate";
import { logEvent } from "./events";
import { invoiceDraftSchema } from "./schema";
import {
  businessSnapshotFrom,
  clientSnapshotFrom,
  paymentAccountSnapshotFrom,
  type ClientSnapshot,
  type PaymentAccountSnapshot,
} from "./snapshots";

export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InvoiceWithItems = Invoice & { items: InvoiceItem[] };

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const MAX_NUMBER_ATTEMPTS = 50;
const EDIT_EVENT_WINDOW_MS = 10 * 60 * 1000;
const LOCKED_STATUSES: ReadonlySet<Invoice["status"]> = new Set(["paid", "void"]);

/** Postgres unique_violation, possibly wrapped by drizzle (`cause`). */
function isUniqueViolation(e: unknown): boolean {
  const code = (err: unknown) => (typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined);
  return code(e) === "23505" || code((e as { cause?: unknown } | null)?.cause) === "23505";
}

function newPublicToken(): string {
  return randomBytes(16).toString("base64url");
}

function ownedBy(userId: string, id: string) {
  return and(eq(invoices.id, id), eq(invoices.userId, userId));
}

export async function findOwned(tx: Pick<Tx, "select">, userId: string, id: string, lock = false): Promise<Invoice> {
  if (!UUID_RE.test(id)) throw new NotFoundError("Invoice not found");
  const query = tx.select().from(invoices).where(ownedBy(userId, id)).limit(1);
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new NotFoundError("Invoice not found");
  return row;
}

/** Locks the profile row; serialises number allocation per user. */
async function lockProfile(tx: Tx, userId: string): Promise<BusinessProfile> {
  const [profile] = await tx
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.userId, userId))
    .for("update")
    .limit(1);
  if (!profile) throw new NotFoundError("Business profile not found");
  return profile;
}

type NewInvoice = Omit<typeof invoices.$inferInsert, "userId" | "number" | "publicToken" | "issueDate">;

/**
 * Inserts an invoice under the next free number and persists the advanced counter on the (already
 * locked) profile. A number that is taken (typed in by hand on another invoice) bumps the sequence
 * and retries, at most 50 times. The insert runs in a savepoint so a unique violation does not
 * abort the surrounding transaction.
 */
async function insertWithNextNumber(
  tx: Tx,
  userId: string,
  profile: BusinessProfile,
  issueDate: string,
  values: NewInvoice,
): Promise<Invoice> {
  const year = Number(issueDate.slice(0, 4));
  let state = {
    prefix: profile.invoicePrefix,
    nextNumber: profile.nextInvoiceNumber,
    numberYear: profile.invoiceNumberYear,
  };

  for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt++) {
    const { number, next } = allocateInvoiceNumber(state, year);
    state = { ...state, ...next };

    const [taken] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.userId, userId), eq(invoices.number, number)))
      .limit(1);
    if (taken) continue;

    try {
      const created = await tx.transaction(async (savepoint) => {
        const [row] = await savepoint
          .insert(invoices)
          .values({ ...values, userId, number, issueDate, publicToken: newPublicToken() })
          .returning();
        return row;
      });
      await tx
        .update(businessProfiles)
        .set({ nextInvoiceNumber: state.nextNumber, invoiceNumberYear: state.numberYear })
        .where(eq(businessProfiles.userId, userId));
      return created;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new ValidationError({ _form: ["duplicateNumber"] });
}

export async function createDraftInvoice(userId: string, opts: { clientId?: string } = {}): Promise<Invoice> {
  // Read everything that needs other connections before the transaction opens.
  const client = opts.clientId ? await getClient(userId, opts.clientId) : null;
  const defaultAccount = (await listPaymentAccounts(userId)).find((a) => a.isDefault);

  return db.transaction(async (tx) => {
    const profile = await lockProfile(tx, userId);
    const issueDate = todayInJakarta();
    const invoice = await insertWithNextNumber(tx, userId, profile, issueDate, {
      clientId: client?.id ?? null,
      currency: client?.defaultCurrency ?? profile.defaultCurrency,
      language: client?.defaultLanguage ?? profile.defaultLanguage,
      template: profile.defaultTemplate,
      accentColor: profile.accentColor,
      dueDate: addDays(issueDate, profile.defaultDueDays),
      clientSnapshot: client ? clientSnapshotFrom(client) : null,
      businessSnapshot: businessSnapshotFrom(profile),
      paymentAccountsSnapshot: defaultAccount ? [paymentAccountSnapshotFrom(defaultAccount)] : [],
      notes: profile.defaultNotes,
    });
    await logEvent(tx, invoice.id, "created");
    return invoice;
  });
}

export async function getInvoice(userId: string, id: string): Promise<InvoiceWithItems> {
  const invoice = await findOwned(db, userId, id);
  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoice.id))
    .orderBy(asc(invoiceItems.position));
  return { ...invoice, items };
}

/**
 * The invoice behind a public link, for the client page. Drafts and unknown tokens give `null`
 * (the page is a 404); a void invoice is returned so the page can say it was cancelled.
 */
export async function getPublicInvoice(token: string): Promise<InvoiceWithItems | null> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.publicToken, token), ne(invoices.status, "draft")))
    .limit(1);
  if (!invoice) return null;
  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoice.id))
    .orderBy(asc(invoiceItems.position));
  return { ...invoice, items };
}

/**
 * An invoice by id with no owner filter, for the print page only. Safe because that page checks a
 * short-lived signature first; never call it with an id taken from a user without that check.
 */
export async function getInvoiceForPrint(id: string): Promise<InvoiceWithItems | null> {
  if (!UUID_RE.test(id)) return null;
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
  if (!invoice) return null;
  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoice.id))
    .orderBy(asc(invoiceItems.position));
  return { ...invoice, items };
}

export async function saveInvoiceDraft(
  userId: string,
  id: string,
  input: unknown,
): Promise<{ savedAt: string; totals: { subtotalMinor: number; discountMinor: number; totalMinor: number } }> {
  const data = parseInput(invoiceDraftSchema, input);
  const totals = calcTotals(data.items, { type: data.discountType, value: data.discountValue });
  const { lineAmounts, ...summary } = totals;

  try {
    return await db.transaction(async (tx) => {
      const existing = await findOwned(tx, userId, id, true);
      if (LOCKED_STATUSES.has(existing.status)) throw new ValidationError({ _form: ["invoiceLocked"] });

      // Ownership of every referenced record, before anything is written.
      let clientSnapshot: ClientSnapshot | null = null;
      if (data.clientId) {
        const [client] = await tx
          .select()
          .from(clients)
          .where(and(eq(clients.id, data.clientId), eq(clients.userId, userId)))
          .limit(1);
        if (!client) throw new NotFoundError("Client not found");
        clientSnapshot = clientSnapshotFrom(client);
      }

      let accountSnapshots: PaymentAccountSnapshot[] = [];
      if (data.paymentAccountIds.length > 0) {
        const accounts = await tx
          .select()
          .from(paymentAccounts)
          .where(and(eq(paymentAccounts.userId, userId), inArray(paymentAccounts.id, data.paymentAccountIds)));
        if (accounts.length !== data.paymentAccountIds.length) throw new NotFoundError("Payment account not found");
        const byId = new Map(accounts.map((a) => [a.id, a]));
        accountSnapshots = data.paymentAccountIds.map((accountId) => paymentAccountSnapshotFrom(byId.get(accountId)!));
      }

      const [clash] = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.userId, userId), eq(invoices.number, data.number)))
        .limit(1);
      if (clash && clash.id !== id) throw new ValidationError({ number: ["duplicateNumber"] });

      const [profile] = await tx
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.userId, userId))
        .limit(1);
      if (!profile) throw new NotFoundError("Business profile not found");

      const savedAt = new Date();
      await tx
        .update(invoices)
        .set({
          clientId: data.clientId,
          number: data.number,
          issueDate: data.issueDate,
          dueDate: data.dueDate,
          currency: data.currency,
          language: data.language,
          template: data.template,
          accentColor: data.accentColor,
          discountType: data.discountType,
          discountValue: data.discountType === "none" ? 0 : data.discountValue,
          notes: data.notes ?? null,
          clientSnapshot,
          businessSnapshot: businessSnapshotFrom(profile),
          paymentAccountsSnapshot: accountSnapshots,
          ...summary,
          updatedAt: savedAt,
        })
        .where(ownedBy(userId, id));

      await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
      if (data.items.length > 0) {
        await tx.insert(invoiceItems).values(
          data.items.map((item, position) => ({
            invoiceId: id,
            position,
            name: item.name,
            description: item.description ?? null,
            quantityMilli: item.quantityMilli,
            unit: item.unit ?? null,
            unitPriceMinor: item.unitPriceMinor,
            amountMinor: lineAmounts[position],
          })),
        );
      }

      if (existing.status !== "draft") {
        const [recent] = await tx
          .select({ id: invoiceEvents.id })
          .from(invoiceEvents)
          .where(
            and(
              eq(invoiceEvents.invoiceId, id),
              eq(invoiceEvents.type, "edited_after_send"),
              gt(invoiceEvents.createdAt, new Date(savedAt.getTime() - EDIT_EVENT_WINDOW_MS)),
            ),
          )
          .limit(1);
        if (!recent) await logEvent(tx, id, "edited_after_send");
      }

      return { savedAt: savedAt.toISOString(), totals: summary };
    });
  } catch (e) {
    // A concurrent save/create that took the number between our check and the update.
    if (isUniqueViolation(e)) throw new ValidationError({ number: ["duplicateNumber"] });
    throw e;
  }
}

export async function duplicateInvoice(userId: string, id: string): Promise<Invoice> {
  return db.transaction(async (tx) => {
    const source = await findOwned(tx, userId, id);
    const items = await tx
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, source.id))
      .orderBy(asc(invoiceItems.position));

    const profile = await lockProfile(tx, userId);
    const issueDate = todayInJakarta();
    const termDays = Math.max(0, daysBetween(source.issueDate, source.dueDate));
    const copy = await insertWithNextNumber(tx, userId, profile, issueDate, {
      status: "draft",
      clientId: source.clientId,
      currency: source.currency,
      language: source.language,
      template: source.template,
      accentColor: source.accentColor,
      dueDate: addDays(issueDate, termDays),
      clientSnapshot: source.clientSnapshot,
      businessSnapshot: source.businessSnapshot,
      paymentAccountsSnapshot: source.paymentAccountsSnapshot,
      discountType: source.discountType,
      discountValue: source.discountValue,
      subtotalMinor: source.subtotalMinor,
      discountMinor: source.discountMinor,
      totalMinor: source.totalMinor,
      notes: source.notes,
      sentAt: null,
      firstViewedAt: null,
      paidAt: null,
      paidNote: null,
      voidedAt: null,
    });

    if (items.length > 0) {
      await tx.insert(invoiceItems).values(
        items.map((item) => ({
          invoiceId: copy.id,
          position: item.position,
          name: item.name,
          description: item.description,
          quantityMilli: item.quantityMilli,
          unit: item.unit,
          unitPriceMinor: item.unitPriceMinor,
          amountMinor: item.amountMinor,
        })),
      );
    }
    await logEvent(tx, copy.id, "duplicated", { sourceInvoiceId: source.id });
    return copy;
  });
}

export async function deleteDraftInvoice(userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const invoice = await findOwned(tx, userId, id, true);
    if (invoice.status !== "draft") throw new ValidationError({ _form: ["onlyDraftDeletable"] });
    await tx.delete(invoices).where(ownedBy(userId, id));
  });
}

/** The tabs of the invoice list. `unpaid` is sent + payment_claimed. */
export const INVOICE_TABS = ["all", "draft", "unpaid", "paid", "void"] as const;
export type InvoiceTab = (typeof INVOICE_TABS)[number];

const TAB_STATUSES: Record<Exclude<InvoiceTab, "all">, Invoice["status"][]> = {
  draft: ["draft"],
  unpaid: ["sent", "payment_claimed"],
  paid: ["paid"],
  void: ["void"],
};

export async function listInvoices(
  userId: string,
  { search, tab = "all", limit }: { search?: string; tab?: InvoiceTab; limit?: number } = {},
): Promise<Invoice[]> {
  const conditions = [eq(invoices.userId, userId)];
  if (tab !== "all") conditions.push(inArray(invoices.status, TAB_STATUSES[tab]));
  const term = search?.trim();
  if (term) {
    const pattern = likePattern(term);
    conditions.push(or(ilike(invoices.number, pattern), sql`${invoices.clientSnapshot}->>'name' ILIKE ${pattern}`)!);
  }
  const query = db
    .select()
    .from(invoices)
    .where(and(...conditions))
    .orderBy(desc(invoices.issueDate), desc(invoices.number));
  return limit === undefined ? query : query.limit(limit);
}

/** How many invoices each tab of the list holds, in one query. */
export async function countInvoicesByTab(userId: string): Promise<Record<InvoiceTab, number>> {
  const rows = await db
    .select({ status: invoices.status, n: count() })
    .from(invoices)
    .where(eq(invoices.userId, userId))
    .groupBy(invoices.status);
  const byStatus = new Map(rows.map((row) => [row.status, row.n]));
  const sum = (statuses: Invoice["status"][]) => statuses.reduce((total, status) => total + (byStatus.get(status) ?? 0), 0);
  return {
    all: rows.reduce((total, row) => total + row.n, 0),
    draft: sum(TAB_STATUSES.draft),
    unpaid: sum(TAB_STATUSES.unpaid),
    paid: sum(TAB_STATUSES.paid),
    void: sum(TAB_STATUSES.void),
  };
}
