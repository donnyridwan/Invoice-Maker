import { and, count, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { invoices, paymentClaims } from "@/db/schema";
import { logEvent } from "@/features/invoices/events";
import { notifyOwnerOfClaim } from "@/features/invoices/notify-claim";
import { findOwned, type Invoice, type Tx } from "@/features/invoices/queries";
import { startOfJakartaDay } from "@/lib/dates";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getStorage, validateUpload } from "@/lib/storage";
import { parseInput, UUID_RE } from "@/lib/validate";
import { MAX_PENDING_CLAIMS, paymentClaimSchema } from "./schema";

export type PaymentClaim = typeof paymentClaims.$inferSelect;

/** Statuses an invoice can receive a claim in (the client can still pay it). */
const CLAIMABLE: readonly Invoice["status"][] = ["sent", "payment_claimed"];

function invalidTransition(): ValidationError {
  return new ValidationError({ _form: ["invalidTransition"] });
}

/** Best-effort removal of a stored proof; a leftover file must never mask the real error. */
async function discardProof(url: string): Promise<void> {
  try {
    await getStorage().delete(url);
  } catch (e) {
    console.error(e);
  }
}

/**
 * Public entry point (no user): records an "I've paid" claim on the invoice behind `token`.
 * An unknown token or an invoice that cannot take a claim (draft, void, paid) is `NotFoundError`.
 * The proof, if any, is validated by its magic bytes before anything is written; the invoice row
 * is locked so concurrent claims cannot get past the limit of three pending ones.
 */
export async function createPaymentClaim(
  token: string,
  input: unknown,
  proof: { bytes: Uint8Array; size: number } | null,
): Promise<PaymentClaim> {
  const data = parseInput(paymentClaimSchema, input);
  const proofType = proof ? validateUpload("payment-proof", proof) : null;

  let storedUrl: string | null = null;
  let created: PaymentClaim;
  try {
    created = await db.transaction(async (tx) => {
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.publicToken, token))
        .for("update")
        .limit(1);
      if (!invoice || !CLAIMABLE.includes(invoice.status)) throw new NotFoundError("Invoice not found");

      const [pending] = await tx
        .select({ n: count() })
        .from(paymentClaims)
        .where(and(eq(paymentClaims.invoiceId, invoice.id), eq(paymentClaims.status, "pending")));
      if (pending.n >= MAX_PENDING_CLAIMS) throw new ValidationError({ _form: ["tooManyClaims"] });

      if (proof && proofType) {
        storedUrl = (await getStorage().put("payment-proof", proof.bytes, proofType)).url;
      }

      const [claim] = await tx
        .insert(paymentClaims)
        .values({
          invoiceId: invoice.id,
          payerName: data.payerName,
          paidOn: data.paidOn,
          amountMinor: data.amountMinor,
          note: data.note ?? null,
          proofUrl: storedUrl,
        })
        .returning();
      await tx
        .update(invoices)
        .set({ status: "payment_claimed", updatedAt: new Date() })
        .where(eq(invoices.id, invoice.id));
      await logEvent(tx, invoice.id, "payment_claimed", { claimId: claim.id });
      return claim;
    });
  } catch (e) {
    if (storedUrl) await discardProof(storedUrl);
    throw e;
  }
  // After the commit and best effort: it logs its own errors and never throws.
  await notifyOwnerOfClaim(created.id);
  return created;
}

/** All claims on an invoice of `userId`, newest first. Another user's invoice is NotFound. */
export async function listClaims(userId: string, invoiceId: string): Promise<PaymentClaim[]> {
  const invoice = await findOwned(db, userId, invoiceId);
  return db
    .select()
    .from(paymentClaims)
    .where(eq(paymentClaims.invoiceId, invoice.id))
    .orderBy(desc(paymentClaims.createdAt));
}

/** Claims waiting for a decision across the user's invoices (the "needs attention" counter). */
export async function countPendingClaims(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(paymentClaims)
    .innerJoin(invoices, eq(invoices.id, paymentClaims.invoiceId))
    .where(
      and(
        eq(invoices.userId, userId),
        eq(invoices.status, "payment_claimed"),
        eq(paymentClaims.status, "pending"),
      ),
    );
  return row.n;
}

/**
 * Resolves the claim's invoice for `userId`, locks the invoice row and re-reads the claim under
 * that lock, so concurrent decisions on the same invoice are serialised.
 */
async function lockClaim(tx: Tx, userId: string, claimId: string): Promise<{ invoice: Invoice; claim: PaymentClaim }> {
  if (!UUID_RE.test(claimId)) throw new NotFoundError("Claim not found");
  const [owned] = await tx
    .select({ invoiceId: paymentClaims.invoiceId })
    .from(paymentClaims)
    .innerJoin(invoices, eq(invoices.id, paymentClaims.invoiceId))
    .where(and(eq(paymentClaims.id, claimId), eq(invoices.userId, userId)))
    .limit(1);
  if (!owned) throw new NotFoundError("Claim not found");

  const invoice = await findOwned(tx, userId, owned.invoiceId, true);
  const [claim] = await tx.select().from(paymentClaims).where(eq(paymentClaims.id, claimId)).limit(1);
  if (!claim) throw new NotFoundError("Claim not found");
  return { invoice, claim };
}

/**
 * The owner accepts a claim: the claim becomes accepted, the invoice paid (on the claimed date)
 * and every other pending claim is rejected. One transaction, invoice row locked.
 */
export async function acceptClaim(userId: string, claimId: string): Promise<PaymentClaim> {
  return db.transaction(async (tx) => {
    const { invoice, claim } = await lockClaim(tx, userId, claimId);
    if (claim.status !== "pending" || invoice.status !== "payment_claimed") throw invalidTransition();

    const now = new Date();
    await tx
      .update(paymentClaims)
      .set({ status: "rejected", decidedAt: now })
      .where(
        and(eq(paymentClaims.invoiceId, invoice.id), eq(paymentClaims.status, "pending"), ne(paymentClaims.id, claim.id)),
      );
    const [accepted] = await tx
      .update(paymentClaims)
      .set({ status: "accepted", decidedAt: now })
      .where(eq(paymentClaims.id, claim.id))
      .returning();
    await tx
      .update(invoices)
      .set({ status: "paid", paidAt: startOfJakartaDay(claim.paidOn), updatedAt: now })
      .where(eq(invoices.id, invoice.id));
    await logEvent(tx, invoice.id, "marked_paid", { claimId: claim.id, paidOn: claim.paidOn });
    return accepted;
  });
}

/**
 * The owner rejects a claim. The invoice goes back to sent only when no other claim is still
 * pending. One transaction, invoice row locked.
 */
export async function rejectClaim(userId: string, claimId: string): Promise<PaymentClaim> {
  return db.transaction(async (tx) => {
    const { invoice, claim } = await lockClaim(tx, userId, claimId);
    if (claim.status !== "pending") throw invalidTransition();

    const now = new Date();
    const [rejected] = await tx
      .update(paymentClaims)
      .set({ status: "rejected", decidedAt: now })
      .where(eq(paymentClaims.id, claim.id))
      .returning();
    await logEvent(tx, invoice.id, "claim_rejected", { claimId: claim.id });

    const [others] = await tx
      .select({ n: count() })
      .from(paymentClaims)
      .where(and(eq(paymentClaims.invoiceId, invoice.id), eq(paymentClaims.status, "pending")));
    if (others.n === 0 && invoice.status === "payment_claimed") {
      await tx.update(invoices).set({ status: "sent", updatedAt: now }).where(eq(invoices.id, invoice.id));
    }
    return rejected;
  });
}

/**
 * Called when the owner marks an invoice paid by hand while claims are waiting: the client did
 * pay, so the most recent pending claim is accepted and any older pending ones are rejected.
 */
export async function settlePendingClaims(tx: Tx, invoiceId: string): Promise<void> {
  const pending = await tx
    .select({ id: paymentClaims.id })
    .from(paymentClaims)
    .where(and(eq(paymentClaims.invoiceId, invoiceId), eq(paymentClaims.status, "pending")))
    .orderBy(desc(paymentClaims.createdAt));
  const now = new Date();
  for (const [index, { id }] of pending.entries()) {
    await tx
      .update(paymentClaims)
      .set({ status: index === 0 ? "accepted" : "rejected", decidedAt: now })
      .where(eq(paymentClaims.id, id));
  }
}

/** The invoice is void: whatever is still waiting for a decision is rejected (nothing can be paid any more). */
export async function rejectPendingClaims(tx: Tx, invoiceId: string): Promise<void> {
  await tx
    .update(paymentClaims)
    .set({ status: "rejected", decidedAt: new Date() })
    .where(and(eq(paymentClaims.invoiceId, invoiceId), eq(paymentClaims.status, "pending")));
}

/** Pending claims on one invoice (public page: the "I've paid" button closes at the limit). */
export async function countInvoicePendingClaims(invoiceId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(paymentClaims)
    .where(and(eq(paymentClaims.invoiceId, invoiceId), eq(paymentClaims.status, "pending")));
  return row.n;
}
