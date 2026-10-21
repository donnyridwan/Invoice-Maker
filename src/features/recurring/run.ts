import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
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
import { notifyOwnersOfDrafts } from "./notify";
import type { Schedule } from "./queries";

export type RunDeps = {
  sendInvoiceEmail?: typeof sendInvoiceEmail;
  transport?: EmailTransport;
  renderPdf?: (invoiceId: string) => Promise<Uint8Array>;
  /** Time budget of the whole run: once it is used up no new schedule or delivery is started. */
  budgetMs?: number;
  /** How long past the budget a delivery already under way may take before it is abandoned. */
  graceMs?: number;
};

/** `skipped`: schedules and deliveries left for the next run because the time budget ran out. */
export type RunResult = { processed: number; created: number; failed: number; skipped: number };

/** The cron route may run 60 s: stop starting work at 45 s, leave room for a delivery in flight and the summary email. */
export const RUN_BUDGET_MS = 45_000;
export const DELIVERY_GRACE_MS = 7_000;
const SUMMARY_TIMEOUT_MS = 5_000;
/** Consecutive runs that may fail before a schedule is deactivated. */
export const MAX_FAILED_RUNS = 7;
/** A pending auto-email older than this is given up on (the invoice stays a draft). */
const PENDING_MAX_AGE_MS = 3 * 24 * 3600_000;
/** Pending deliveries the start of one run sweeps. */
const SWEEP_LIMIT = 50;
/** `lastError` codes that a successful delivery clears again. */
const DELIVERY_ERRORS = ["emailNotVerified", "emailDisabled", "clientEmailMissing", "emailFailed", "rateLimited"];
/** Codes of `sendInvoiceEmail` that retrying cannot fix. */
const PERMANENT_ERRORS = ["emailNotVerified", "emailDisabled", "invalidTransition"];

type Outcome = { schedule: Schedule; created: Invoice[]; pendingIds: string[] };

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
      return { schedule, created: [], pendingIds: [] };
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
    let lastRunDate: string | null = null;
    for (const runDate of dueRunDates(schedule, today)) {
      lastRunDate = runDate;
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

    // Auto-email only the invoice of the most recent run date, and only once the schedule has caught
    // up; older ones stay drafts. It is flagged here, in the generating transaction, so that a run
    // cut off before the email went out never loses it (the next run sweeps the flag).
    const pendingIds: string[] = [];
    const latest = created.find((invoice) => invoice.issueDate === lastRunDate);
    if (schedule.delivery === "auto_email" && latest && (finished || nextRunOn > today)) {
      await tx.update(invoices).set({ emailPending: true }).where(eq(invoices.id, latest.id));
      pendingIds.push(latest.id);
    }

    await tx
      .update(recurringSchedules)
      .set({ runsDone, nextRunOn, active: !finished, lastError: null, failedRuns: 0, updatedAt: new Date() })
      .where(eq(recurringSchedules.id, schedule.id));
    return { schedule: { ...schedule, runsDone, nextRunOn, active: !finished, lastError: null, failedRuns: 0 }, created, pendingIds };
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

async function clearPending(invoiceId: string): Promise<void> {
  await db.update(invoices).set({ emailPending: false }).where(eq(invoices.id, invoiceId));
}

type Raced<T> = { timedOut: true } | { timedOut: false; value: T };

/** `work`'s result, or `timedOut` when it takes longer than `ms` (it keeps running, unobserved). */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<Raced<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), Math.max(0, ms));
  });
  try {
    return await Promise.race([work.then((value) => ({ timedOut: false as const, value })), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

type Delivery = "sent" | "dropped" | "retry" | "timeout";

/**
 * Emails one generated invoice that is flagged `email_pending`. Runs after the generating
 * transaction committed (or in a later run's sweep), so nothing here can undo an invoice.
 * - Sent: the flag is cleared, and so is a delivery error on the schedule.
 * - Not sendable and never will be (hand-sent, void, schedule stopped, older than three days,
 *   owner not verified, email off, client without address): the flag is cleared; the invoice stays
 *   a draft, with an `email_failed` event and the reason on the schedule when it was the owner's setup.
 * - A failed attempt: `email_failed` is logged, the code goes to the schedule's `lastError`, and the
 *   flag stays so that the next run tries again.
 * - Still running after `timeoutMs`: abandoned for this run, the flag stays.
 */
async function deliverPending(invoiceId: string, deps: RunDeps, timeoutMs: number): Promise<Delivery> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice) return "dropped";
  const scheduleId = invoice.recurringScheduleId;
  if (invoice.status !== "draft" || !scheduleId || Date.now() - invoice.createdAt.getTime() > PENDING_MAX_AGE_MS) {
    await clearPending(invoiceId);
    return "dropped";
  }

  const [owner] = await db
    .select({ id: user.id, email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, invoice.userId))
    .limit(1);
  const transport = deps.transport ?? getEmailTransport();
  const to = invoice.clientSnapshot?.email;
  const ineligible = !owner?.emailVerified
    ? "emailNotVerified"
    : transport.kind === "disabled"
      ? "emailDisabled"
      : !to
        ? "clientEmailMissing"
        : null;
  if (ineligible) {
    await logEvent(db, invoice.id, "email_failed", { error: ineligible });
    await setLastError(scheduleId, ineligible);
    await clearPending(invoiceId);
    return "dropped";
  }

  const send = deps.sendInvoiceEmail ?? sendInvoiceEmail;
  try {
    const full = await getInvoice(invoice.userId, invoice.id);
    const raced = await withTimeout(
      send(owner, invoice.id, { to, cc: [], ...defaultInvoiceEmail(emailFacts(full)) }, { transport, renderPdf: deps.renderPdf }),
      timeoutMs,
    );
    if (raced.timedOut) return "timeout";
  } catch (e) {
    console.error("[recurring] auto email failed", e);
    const code = e instanceof ValidationError ? (e.fieldErrors._form?.[0] ?? "emailFailed") : "emailFailed";
    // A failed delivery is already logged by sendInvoiceEmail itself.
    if (!(e instanceof ValidationError && code === "emailFailed")) {
      const message = e instanceof Error ? e.message : String(e);
      await logEvent(db, invoice.id, "email_failed", { error: code === "emailFailed" ? message.slice(0, 500) : code });
    }
    await setLastError(scheduleId, code);
    if (PERMANENT_ERRORS.includes(code)) {
      await clearPending(invoiceId);
      return "dropped";
    }
    return "retry";
  }

  await clearPending(invoiceId);
  await db
    .update(recurringSchedules)
    .set({ lastError: null, updatedAt: new Date() })
    .where(and(eq(recurringSchedules.id, scheduleId), inArray(recurringSchedules.lastError, DELIVERY_ERRORS)));
  return "sent";
}

/** A schedule's run threw: count it, and deactivate the schedule after `MAX_FAILED_RUNS` in a row. */
async function recordFailure(scheduleId: string): Promise<void> {
  try {
    const reached = sql`${recurringSchedules.failedRuns} + 1 >= ${MAX_FAILED_RUNS}`;
    await db
      .update(recurringSchedules)
      .set({
        failedRuns: sql`${recurringSchedules.failedRuns} + 1`,
        lastError: sql`CASE WHEN ${reached} THEN 'tooManyFailures' ELSE 'runFailed' END`,
        active: sql`CASE WHEN ${reached} THEN false ELSE ${recurringSchedules.active} END`,
        updatedAt: new Date(),
      })
      .where(eq(recurringSchedules.id, scheduleId));
  } catch (e) {
    console.error("[recurring] could not record the failure", e);
  }
}

/**
 * The daily cron. In order:
 * 1. sweep: auto-emails still pending from an earlier run are delivered;
 * 2. every active schedule whose next run is on or before `today` (WIB) creates its invoices (one
 *    per missed date, at most 12) and advances; for `auto_email` the newest one is sent.
 * One schedule failing is recorded and never stops the others (seven failed runs in a row
 * deactivate it). The whole run has a time budget: after it nothing new is started, what is left
 * is counted in `skipped` and picked up by the next run. `processed` counts the schedules picked
 * up, `failed` those that threw. Afterwards each owner gets one summary email of the drafts.
 */
export async function runDueSchedules(today: string, deps: RunDeps = {}): Promise<RunResult> {
  const startedAt = Date.now();
  const budgetMs = deps.budgetMs ?? RUN_BUDGET_MS;
  const graceMs = deps.graceMs ?? DELIVERY_GRACE_MS;
  const remaining = () => budgetMs - (Date.now() - startedAt);
  const result: RunResult = { processed: 0, created: 0, failed: 0, skipped: 0 };

  const deliver = async (invoiceId: string): Promise<boolean> => {
    if (remaining() <= 0) {
      result.skipped += 1;
      return false;
    }
    try {
      const outcome = await deliverPending(invoiceId, deps, remaining() + graceMs);
      if (outcome === "timeout") result.skipped += 1;
    } catch (e) {
      console.error(`[recurring] delivery of invoice ${invoiceId} failed`, e);
    }
    return true;
  };

  const pending = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.emailPending, true))
    .orderBy(asc(invoices.createdAt))
    .limit(SWEEP_LIMIT);
  for (const { id } of pending) await deliver(id);

  const due = await db
    .select({ id: recurringSchedules.id })
    .from(recurringSchedules)
    .where(and(eq(recurringSchedules.active, true), lte(recurringSchedules.nextRunOn, today)))
    .orderBy(asc(recurringSchedules.nextRunOn), asc(recurringSchedules.createdAt));

  const generatedIds: string[] = [];
  for (const [index, { id }] of due.entries()) {
    if (remaining() <= 0) {
      result.skipped += due.length - index;
      break;
    }
    let outcome: Outcome | null;
    try {
      outcome = await generateFor(id, today);
    } catch (e) {
      console.error(`[recurring] schedule ${id} failed`, e);
      result.processed += 1;
      result.failed += 1;
      await recordFailure(id);
      continue;
    }
    if (!outcome) continue;
    result.processed += 1;
    result.created += outcome.created.length;
    generatedIds.push(...outcome.created.map((invoice) => invoice.id));
    for (const invoiceId of outcome.pendingIds) await deliver(invoiceId);
  }

  // Whatever is still a draft (every "draft" delivery, an auto-email that could not go out) is
  // reported to its owner in one summary email each; the dashboard shows them anyway.
  if (remaining() + graceMs > 0) {
    await withTimeout(notifyOwnersOfDrafts(generatedIds, { transport: deps.transport }), SUMMARY_TIMEOUT_MS);
  }
  return result;
}
