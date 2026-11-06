import { and, asc, count, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, invoices, recurringSchedules } from "@/db/schema";
import { findOwned, isUniqueViolation, type Tx } from "@/features/invoices/queries";
import { todayInJakarta } from "@/lib/dates";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { firstRunOnOrAfter, isFinished, scheduleStatus, type ScheduleStatus } from "@/lib/recurrence";
import { parseInput, UUID_RE } from "@/lib/validate";
import { recurringScheduleSchema, type RecurringScheduleData } from "./schema";

export type Schedule = typeof recurringSchedules.$inferSelect;

export type ScheduleRow = Schedule & {
  status: ScheduleStatus;
  sourceNumber: string | null;
  clientName: string | null;
  currency: string | null;
  totalMinor: number | null;
};

function formError(code: string): ValidationError {
  return new ValidationError({ _form: [code] });
}

function settingsFrom(data: RecurringScheduleData) {
  return {
    frequency: data.frequency,
    interval: data.interval,
    anchorDay: Number(data.nextRunOn.slice(8, 10)),
    nextRunOn: data.nextRunOn,
    endType: data.endType,
    endCount: data.endCount,
    endDate: data.endDate,
    delivery: data.delivery,
  };
}

async function findOwnedSchedule(tx: Pick<Tx, "select">, workspaceId: string, id: string, lock = false): Promise<Schedule> {
  if (!UUID_RE.test(id)) throw new NotFoundError("Schedule not found");
  const query = tx
    .select()
    .from(recurringSchedules)
    .where(and(eq(recurringSchedules.id, id), eq(recurringSchedules.workspaceId, workspaceId)))
    .limit(1);
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new NotFoundError("Schedule not found");
  return row;
}

/** Whether the schedule can still run: its source exists and is not void. */
async function assertSourceUsable(tx: Pick<Tx, "select">, workspaceId: string, schedule: Schedule): Promise<void> {
  const [source] = schedule.sourceInvoiceId
    ? await tx
        .select({ status: invoices.status })
        .from(invoices)
        .where(and(eq(invoices.id, schedule.sourceInvoiceId), eq(invoices.workspaceId, workspaceId)))
        .limit(1)
    : [];
  if (!source || source.status === "void") throw formError("invalidTransition");
}

/**
 * Starts a schedule that copies `sourceInvoiceId`. One schedule per source invoice; a void source is
 * refused. `createdBy` is the member whose email sends its auto emails.
 */
export async function createSchedule(
  workspaceId: string,
  sourceInvoiceId: string,
  input: unknown,
  createdBy: string | null = null,
): Promise<Schedule> {
  try {
    return await db.transaction(async (tx) => {
      const source = await findOwned(tx, workspaceId, sourceInvoiceId, true);
      const data = parseInput(recurringScheduleSchema, input);
      if (source.status === "void") throw formError("invalidTransition");

      const [existing] = await tx
        .select({ id: recurringSchedules.id })
        .from(recurringSchedules)
        .where(eq(recurringSchedules.sourceInvoiceId, source.id))
        .limit(1);
      if (existing) throw formError("scheduleExists");

      const [row] = await tx
        .insert(recurringSchedules)
        .values({ ...settingsFrom(data), workspaceId, createdBy, sourceInvoiceId: source.id })
        .returning();
      return row;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw formError("scheduleExists");
    throw e;
  }
}

/**
 * Changes the rule of a schedule. The runs done so far are kept; an old error is cleared, except
 * that its source is gone (editing cannot bring it back). `updatedBy`, when given, becomes the
 * member its auto emails go out from.
 */
export async function updateSchedule(
  workspaceId: string,
  id: string,
  input: unknown,
  updatedBy?: string,
): Promise<Schedule> {
  return db.transaction(async (tx) => {
    const current = await findOwnedSchedule(tx, workspaceId, id, true);
    const data = parseInput(recurringScheduleSchema, input);
    const [row] = await tx
      .update(recurringSchedules)
      .set({
        ...settingsFrom(data),
        ...(updatedBy ? { createdBy: updatedBy } : {}),
        lastError: current.lastError === "sourceUnavailable" ? current.lastError : null,
        updatedAt: new Date(),
      })
      .where(and(eq(recurringSchedules.id, id), eq(recurringSchedules.workspaceId, workspaceId)))
      .returning();
    return row;
  });
}

export async function pauseSchedule(workspaceId: string, id: string): Promise<Schedule> {
  return db.transaction(async (tx) => {
    await findOwnedSchedule(tx, workspaceId, id, true);
    const [row] = await tx
      .update(recurringSchedules)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(recurringSchedules.id, id), eq(recurringSchedules.workspaceId, workspaceId)))
      .returning();
    return row;
  });
}

/**
 * Turns a paused schedule back on. Runs missed while it was paused are skipped (next run is the
 * first date from today on). A schedule that has run out, or whose source is gone or void, cannot resume.
 */
export async function resumeSchedule(workspaceId: string, id: string): Promise<Schedule> {
  return db.transaction(async (tx) => {
    const schedule = await findOwnedSchedule(tx, workspaceId, id, true);
    await assertSourceUsable(tx, workspaceId, schedule);
    const nextRunOn = firstRunOnOrAfter(schedule.nextRunOn, schedule, todayInJakarta());
    if (isFinished(schedule, nextRunOn)) throw formError("scheduleFinished");
    const [row] = await tx
      .update(recurringSchedules)
      .set({ active: true, nextRunOn, lastError: null, failedRuns: 0, updatedAt: new Date() })
      .where(and(eq(recurringSchedules.id, id), eq(recurringSchedules.workspaceId, workspaceId)))
      .returning();
    return row;
  });
}

/** Removes the schedule; the invoices it already generated stay. */
export async function deleteSchedule(workspaceId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await findOwnedSchedule(tx, workspaceId, id, true);
    await tx
      .delete(recurringSchedules)
      .where(and(eq(recurringSchedules.id, id), eq(recurringSchedules.workspaceId, workspaceId)));
  });
}

/** The schedule that repeats this invoice, or null. Another user's invoice is NotFound. */
export async function getScheduleForInvoice(workspaceId: string, invoiceId: string): Promise<Schedule | null> {
  const invoice = await findOwned(db, workspaceId, invoiceId);
  const [row] = await db
    .select()
    .from(recurringSchedules)
    .where(and(eq(recurringSchedules.sourceInvoiceId, invoice.id), eq(recurringSchedules.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

/** All of the user's schedules (active first, then by next run) with the source invoice's number, client and total. */
export async function listSchedules(workspaceId: string): Promise<ScheduleRow[]> {
  const rows = await db
    .select({
      schedule: recurringSchedules,
      sourceNumber: invoices.number,
      clientSnapshot: invoices.clientSnapshot,
      currency: invoices.currency,
      totalMinor: invoices.totalMinor,
    })
    .from(recurringSchedules)
    .leftJoin(invoices, eq(invoices.id, recurringSchedules.sourceInvoiceId))
    .where(eq(recurringSchedules.workspaceId, workspaceId))
    .orderBy(desc(recurringSchedules.active), asc(recurringSchedules.nextRunOn), asc(recurringSchedules.createdAt));
  return rows.map((row) => ({
    ...row.schedule,
    status: scheduleStatus(row.schedule),
    sourceNumber: row.sourceNumber,
    clientName: row.clientSnapshot?.name ?? null,
    currency: row.currency,
    totalMinor: row.totalMinor,
  }));
}

/**
 * What the schedule dialog needs to know about an invoice: its schedule (if any) and the address
 * automatic emails would go to (the client's current email, else the one frozen on the invoice).
 */
export async function getScheduleContext(
  workspaceId: string,
  invoiceId: string,
): Promise<{ schedule: Schedule | null; clientEmail: string | null }> {
  const invoice = await findOwned(db, workspaceId, invoiceId);
  const [schedule] = await db
    .select()
    .from(recurringSchedules)
    .where(and(eq(recurringSchedules.sourceInvoiceId, invoice.id), eq(recurringSchedules.workspaceId, workspaceId)))
    .limit(1);
  const [client] = invoice.clientId
    ? await db
        .select({ email: clients.email })
        .from(clients)
        .where(and(eq(clients.id, invoice.clientId), eq(clients.workspaceId, workspaceId)))
        .limit(1)
    : [];
  return { schedule: schedule ?? null, clientEmail: (client ? client.email : invoice.clientSnapshot?.email) || null };
}

/** How many schedules the user has (the count on the "Berulang" tab). */
export async function countSchedules(workspaceId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(recurringSchedules).where(eq(recurringSchedules.workspaceId, workspaceId));
  return row.n;
}
