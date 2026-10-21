import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { invoiceEvents, invoices } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";
import { UUID_RE } from "@/lib/validate";

export type InvoiceEvent = typeof invoiceEvents.$inferSelect;

/** Every kind of activity logged on an invoice (spec §4, plus `sent` and `unmarked_paid`). */
export type InvoiceEventType =
  | "created"
  | "edited_after_send"
  | "sent"
  | "sent_email"
  | "shared_whatsapp"
  | "link_copied"
  | "viewed"
  | "payment_claimed"
  | "claim_rejected"
  | "marked_paid"
  | "unmarked_paid"
  | "voided"
  | "duplicated"
  | "recurring_generated"
  | "email_failed";

/** Anything that can run an insert: `db` or a transaction. */
type EventWriter = Pick<typeof db, "insert">;

/** Appends an event. Pass the surrounding transaction so the event commits with the change. */
export async function logEvent(
  tx: EventWriter,
  invoiceId: string,
  type: InvoiceEventType,
  meta: Record<string, unknown> = {},
): Promise<void> {
  await tx.insert(invoiceEvents).values({ invoiceId, type, meta });
}

/** The invoice's activity log, newest first. Another user's (or a missing) invoice is NotFound. */
export async function listEvents(userId: string, invoiceId: string): Promise<InvoiceEvent[]> {
  if (!UUID_RE.test(invoiceId)) throw new NotFoundError("Invoice not found");
  const [owned] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)))
    .limit(1);
  if (!owned) throw new NotFoundError("Invoice not found");
  return db.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, invoiceId)).orderBy(desc(invoiceEvents.createdAt));
}
