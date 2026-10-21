import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, invoiceItems, invoices, paymentAccounts, recurringSchedules, user } from "@/db/schema";
import { defaultInvoiceEmail } from "@/features/invoices/email-content";
import { logEvent } from "@/features/invoices/events";
import { getInvoice, insertInvoiceCopy, isUniqueViolation, type Invoice } from "@/features/invoices/queries";
import { emailFacts, sendInvoiceEmail } from "@/features/invoices/send-email";
import {
  businessSnapshotFrom,
  clientSnapshotFrom,
  paymentAccountSnapshotFrom,
  type PaymentAccountSnapshot,
} from "@/features/invoices/snapshots";
import { getEmailTransport, type EmailTransport } from "@/lib/email";
import { ValidationError } from "@/lib/errors";
import { dueRunDates, isFinished, nextRunDate } from "@/lib/recurrence";
import type { Schedule } from "./queries";

export type RunDeps = {
  sendInvoiceEmail?: typeof sendInvoiceEmail;
  transport?: EmailTransport;
  renderPdf?: (invoiceId: string) => Promise<Uint8Array>;
};

export type RunResult = { processed: number; created: number; failed: number };

type Outcome = { schedule: Schedule; created: Invoice[] };

/**
 * Generates the invoices of one schedule in its own transaction. The schedule row is locked and
 * re-read first, so a concurrent or repeated cron run finds nothing due and does nothing (the
 * unique (schedule, issue date) index is the backstop). Null: not due any more.
 */
async function generateFor(scheduleId: string, today: string): Promise<Outcome | null> {
  return db.transaction(async (tx) => {
    const [schedule] = await tx
      .select()
      .from(recurringSchedules)
      .where(eq(recurringSchedules.id, scheduleId))
      .for("update")
      .limit(1);
    if (!schedule || !schedule.active || schedule.nextRunOn > today) return null;
    const { userId } = schedule;

    const [source] = schedule.sourceInvoiceId
      ? await tx
          .select()
          .from(invoices)
          .where(and(eq(invoices.id, schedule.sourceInvoiceId), eq(invoices.userId, userId)))
          .limit(1)
      : [];
    if (!source || source.status === "void") {
      await tx
        .update(recurringSchedules)
        .set({ active: false, lastError: "sourceUnavailable", updatedAt: new Date() })
        .where(eq(recurringSchedules.id, schedule.id));
      return { schedule, created: [] };
    }

    const items = await tx
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, source.id))
      .orderBy(asc(invoiceItems.position));

    // Live data the new invoices freeze: the client, and the payment accounts the source listed
    // (those since archived or deleted drop out; with none left, the default account steps in).
    const [client] = source.clientId
      ? await tx
          .select()
          .from(clients)
          .where(and(eq(clients.id, source.clientId), eq(clients.userId, userId)))
          .limit(1)
      : [];
    const wanted = source.paymentAccountsSnapshot.map((a) => a.id);
    let accounts = wanted.length
      ? await tx
          .select()
          .from(paymentAccounts)
          .where(and(eq(paymentAccounts.userId, userId), isNull(paymentAccounts.archivedAt), inArray(paymentAccounts.id, wanted)))
      : [];
    accounts = wanted.flatMap((id) => accounts.filter((a) => a.id === id));
    if (wanted.length > 0 && accounts.length === 0) {
      accounts = await tx
        .select()
        .from(paymentAccounts)
        .where(and(eq(paymentAccounts.userId, userId), isNull(paymentAccounts.archivedAt), eq(paymentAccounts.isDefault, true)))
        .limit(1);
    }
    const accountSnapshots: PaymentAccountSnapshot[] = accounts.map(paymentAccountSnapshotFrom);

    const created: Invoice[] = [];
    let runsDone = schedule.runsDone;
    let nextRunOn = schedule.nextRunOn;
    for (const runDate of dueRunDates(schedule, today)) {
      try {
        created.push(
          await insertInvoiceCopy(tx, userId, source, items, {
            issueDate: runDate,
            recurringScheduleId: schedule.id,
            snapshots: (profile) => ({
              clientSnapshot: client ? clientSnapshotFrom(client) : source.clientSnapshot,
              businessSnapshot: businessSnapshotFrom(profile),
              paymentAccountsSnapshot: accountSnapshots,
            }),
            event: { type: "recurring_generated", meta: { scheduleId: schedule.id, runDate } },
          }),
        );
      } catch (e) {
        // This run date already has its invoice (an earlier, interrupted run): counts as done.
        if (!isUniqueViolation(e)) throw e;
      }
      runsDone += 1;
      nextRunOn = nextRunDate(runDate, schedule);
    }

    const finished = isFinished({ ...schedule, runsDone }, nextRunOn);
    await tx
      .update(recurringSchedules)
      .set({ runsDone, nextRunOn, active: !finished, lastError: null, updatedAt: new Date() })
      .where(eq(recurringSchedules.id, schedule.id));
    return { schedule: { ...schedule, runsDone, nextRunOn, active: !finished, lastError: null }, created };
  });
}

async function setLastError(scheduleId: string, code: string): Promise<void> {
  try {
    await db
      .update(recurringSchedules)
      .set({ lastError: code, updatedAt: new Date() })
      .where(eq(recurringSchedules.id, scheduleId));
  } catch (e) {
    console.error("[recurring] could not record the error", e);
  }
}

/**
 * Emails the generated invoices of an `auto_email` schedule. Runs after the generating transaction
 * committed, so nothing here can undo an invoice: whatever goes wrong leaves it a draft, logs an
 * `email_failed` event and puts a code in the schedule's `lastError`.
 */
async function deliver({ schedule, created }: Outcome, deps: RunDeps): Promise<void> {
  if (schedule.delivery !== "auto_email" || created.length === 0) return;

  const [owner] = await db
    .select({ id: user.id, email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, schedule.userId))
    .limit(1);
  const transport = deps.transport ?? getEmailTransport();
  const send = deps.sendInvoiceEmail ?? sendInvoiceEmail;
  let lastError: string | null = null;

  for (const invoice of created) {
    const email = invoice.clientSnapshot?.email;
    const ineligible = !owner?.emailVerified
      ? "emailNotVerified"
      : transport.kind === "disabled"
        ? "emailDisabled"
        : !email
          ? "clientEmailMissing"
          : null;
    if (ineligible) {
      await logEvent(db, invoice.id, "email_failed", { error: ineligible });
      lastError = ineligible;
      continue;
    }

    try {
      const full = await getInvoice(schedule.userId, invoice.id);
      await send(
        owner,
        invoice.id,
        { to: email, cc: [], ...defaultInvoiceEmail(emailFacts(full)) },
        { transport, renderPdf: deps.renderPdf },
      );
    } catch (e) {
      console.error("[recurring] auto email failed", e);
      const code = e instanceof ValidationError ? (e.fieldErrors._form?.[0] ?? "emailFailed") : "emailFailed";
      // A failed delivery is already logged by sendInvoiceEmail itself.
      if (!(e instanceof ValidationError && code === "emailFailed")) {
        const message = e instanceof Error ? e.message : String(e);
        await logEvent(db, invoice.id, "email_failed", { error: code === "emailFailed" ? message.slice(0, 500) : code });
      }
      lastError = code;
    }
  }
  if (lastError) await setLastError(schedule.id, lastError);
}

/**
 * The daily cron: every active schedule whose next run is on or before `today` (WIB) creates its
 * invoices (one per missed date, at most 12), advances, and, for `auto_email`, sends them.
 * One schedule failing is recorded and never stops the others. `processed` counts the schedules
 * picked up, `failed` those that threw.
 */
export async function runDueSchedules(today: string, deps: RunDeps = {}): Promise<RunResult> {
  const due = await db
    .select({ id: recurringSchedules.id })
    .from(recurringSchedules)
    .where(and(eq(recurringSchedules.active, true), lte(recurringSchedules.nextRunOn, today)))
    .orderBy(asc(recurringSchedules.nextRunOn), asc(recurringSchedules.createdAt));

  const result: RunResult = { processed: 0, created: 0, failed: 0 };
  for (const { id } of due) {
    let outcome: Outcome | null;
    try {
      outcome = await generateFor(id, today);
    } catch (e) {
      console.error(`[recurring] schedule ${id} failed`, e);
      result.processed += 1;
      result.failed += 1;
      await setLastError(id, "runFailed");
      continue;
    }
    if (!outcome) continue;
    result.processed += 1;
    result.created += outcome.created.length;
    try {
      await deliver(outcome, deps);
    } catch (e) {
      console.error(`[recurring] delivery for schedule ${id} failed`, e);
    }
  }
  return result;
}
