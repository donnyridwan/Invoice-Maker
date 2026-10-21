import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { invoiceItems, invoices } from "@/db/schema";
import { isIsoDate, startOfJakartaDay } from "@/lib/dates";
import { ValidationError } from "@/lib/errors";
import { optionalText } from "@/lib/zod-helpers";
import { parseInput } from "@/lib/validate";
import { settlePendingClaims } from "@/features/payment-claims/queries";
import { logEvent, type InvoiceEventType } from "./events";
import { findOwned, type Invoice, type InvoiceWithItems, type Tx } from "./queries";

type Status = Invoice["status"];

export type ShareChannel = "manual" | "link" | "whatsapp" | "email";

/** Event logged when an already-sent invoice is shared again; `manual` leaves no trace. */
const SHARE_EVENTS: Record<Exclude<ShareChannel, "manual">, InvoiceEventType> = {
  link: "link_copied",
  whatsapp: "shared_whatsapp",
  email: "sent_email",
};

/** Statuses a client can open through the public link (and so can be "viewed"). */
const VIEWABLE_STATUSES: Status[] = ["sent", "payment_claimed", "paid"];

function invalidTransition(): ValidationError {
  return new ValidationError({ _form: ["invalidTransition"] });
}

/** An invoice can go out only with a client, at least one item and a total above zero. */
export function assertSendable(inv: InvoiceWithItems): void {
  if (!inv.clientSnapshot) throw new ValidationError({ _form: ["clientRequired"] });
  if (inv.items.length === 0) throw new ValidationError({ _form: ["itemsRequired"] });
  if (inv.totalMinor <= 0) throw new ValidationError({ _form: ["totalZero"] });
}

/**
 * Locks the owned invoice, checks the transition is allowed from its current status and applies
 * `changes` plus the event in one transaction.
 */
async function transition(
  userId: string,
  id: string,
  from: readonly Status[],
  to: Status,
  changes: Partial<typeof invoices.$inferInsert>,
  event: { type: InvoiceEventType; meta?: Record<string, unknown> },
): Promise<Invoice> {
  return db.transaction(async (tx) => {
    const current = await findOwned(tx, userId, id, true);
    if (!from.includes(current.status)) throw invalidTransition();
    return applyTransition(tx, current, to, changes, event);
  });
}

async function applyTransition(
  tx: Tx,
  current: Invoice,
  to: Status,
  changes: Partial<typeof invoices.$inferInsert>,
  event: { type: InvoiceEventType; meta?: Record<string, unknown> },
): Promise<Invoice> {
  const [updated] = await tx
    .update(invoices)
    .set({ ...changes, status: to, updatedAt: new Date() })
    .where(and(eq(invoices.id, current.id), eq(invoices.userId, current.userId)))
    .returning();
  await logEvent(tx, current.id, event.type, event.meta);
  return updated;
}

/**
 * Sends a draft (draft → sent, `sentAt`, event `sent` with the channel). On an invoice that was
 * already sent (or paid) nothing changes except the share event for the channel, if it has one.
 */
export async function markSent(userId: string, id: string, channel: ShareChannel): Promise<Invoice> {
  return db.transaction(async (tx) => {
    const current = await findOwned(tx, userId, id, true);

    if (current.status === "draft") {
      const items = await tx
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, current.id))
        .orderBy(asc(invoiceItems.position));
      assertSendable({ ...current, items });
      return applyTransition(tx, current, "sent", { sentAt: new Date() }, { type: "sent", meta: { channel } });
    }

    if (current.status === "void") throw invalidTransition();
    if (channel !== "manual") await logEvent(tx, current.id, SHARE_EVENTS[channel]);
    return current;
  });
}

const markPaidSchema = z.object({
  paidOn: z.string("required").refine(isIsoDate, "invalidDate"),
  note: optionalText(2000),
});

/**
 * sent / payment_claimed → paid. `paidOn` (YYYY-MM-DD) is stored as that day's 00:00 WIB. Claims
 * still pending are settled with it: the most recent is accepted, any others rejected.
 */
export async function markPaid(
  userId: string,
  id: string,
  input: { paidOn: string; note?: string },
): Promise<Invoice> {
  const { paidOn, note } = parseInput(markPaidSchema, input);
  return db.transaction(async (tx) => {
    const current = await findOwned(tx, userId, id, true);
    if (current.status !== "sent" && current.status !== "payment_claimed") throw invalidTransition();
    const updated = await applyTransition(
      tx,
      current,
      "paid",
      { paidAt: startOfJakartaDay(paidOn), paidNote: note ?? null },
      { type: "marked_paid", meta: { paidOn } },
    );
    await settlePendingClaims(tx, current.id);
    return updated;
  });
}

/** paid → sent again, clearing the payment. */
export async function unmarkPaid(userId: string, id: string): Promise<Invoice> {
  return transition(userId, id, ["paid"], "sent", { paidAt: null, paidNote: null }, { type: "unmarked_paid" });
}

/** draft / sent / payment_claimed → void. A paid invoice has to be unmarked first. */
export async function voidInvoice(userId: string, id: string): Promise<Invoice> {
  return transition(
    userId,
    id,
    ["draft", "sent", "payment_claimed"],
    "void",
    { voidedAt: new Date() },
    { type: "voided" },
  );
}

/**
 * Called when the public page is opened. The first view by someone other than the owner stamps
 * `firstViewedAt` and logs `viewed`; the conditional UPDATE makes that happen exactly once even
 * for concurrent visits. Anything else (draft, void, unknown token, the owner) is a no-op.
 */
export async function recordPublicView(token: string, viewerUserId: string | null): Promise<void> {
  await db.transaction(async (tx) => {
    const [first] = await tx
      .update(invoices)
      .set({ firstViewedAt: new Date() })
      .where(
        and(
          eq(invoices.publicToken, token),
          inArray(invoices.status, VIEWABLE_STATUSES),
          isNull(invoices.firstViewedAt),
          viewerUserId ? ne(invoices.userId, viewerUserId) : undefined,
        ),
      )
      .returning({ id: invoices.id });
    if (first) await logEvent(tx, first.id, "viewed");
  });
}
