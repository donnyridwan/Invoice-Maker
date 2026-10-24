import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { businessProfiles, clients, invoiceEvents, invoices, recurringSchedules, user } from "@/db/schema";
import { createClient } from "@/features/clients/queries";
import { deleteInvoice, getInvoice, createDraftInvoice, saveInvoiceDraft } from "@/features/invoices/queries";
import { markSent, voidInvoice } from "@/features/invoices/lifecycle";
import { ensureProfile } from "@/features/profile/queries";
import {
  createSchedule,
  deleteSchedule,
  getScheduleForInvoice,
  listSchedules,
  pauseSchedule,
  resumeSchedule,
  updateSchedule,
} from "@/features/recurring/queries";
import { runDueSchedules } from "@/features/recurring/run";
import type { EmailTransport, OutgoingEmail } from "@/lib/email";
import { addDays, todayInJakarta } from "@/lib/dates";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createTestUser, resetDb, testDb } from "./helpers";

const today = todayInJakarta();
const PDF_BYTES = new TextEncoder().encode("%PDF-1.4 fake");
const renderPdf = async () => PDF_BYTES;

function recordingTransport(kind: EmailTransport["kind"] = "file", failWith?: Error) {
  const sent: OutgoingEmail[] = [];
  const transport: EmailTransport = {
    kind,
    async send(email) {
      if (failWith) throw failWith;
      sent.push(email);
      return { id: `msg-${sent.length}` };
    },
  };
  return { transport, sent };
}

type Owner = { id: string; email: string; emailVerified: boolean };

async function setupOwner(opts: { verified?: boolean } = {}): Promise<Owner> {
  const verified = opts.verified ?? true;
  const u = await createTestUser({ emailVerified: verified, name: "Donny" });
  await ensureProfile(u.id, { businessName: "Studio Donny", email: "donny@example.test" });
  return { id: u.id, email: u.email, emailVerified: verified };
}

/** A draft of 1.500.000 IDR + 250.000 IDR (two items) for a client; 14 days payment term. */
async function sourceInvoice(userId: string, opts: { clientEmail?: string | null } = {}) {
  const draft = await createDraftInvoice(userId);
  const client = await createClient(userId, {
    name: "PT Maju Jaya",
    ...(opts.clientEmail === null ? {} : { email: opts.clientEmail ?? "billing@majujaya.test" }),
    defaultCurrency: "IDR",
  });
  await saveInvoiceDraft(userId, draft.id, {
    clientId: client.id,
    number: draft.number,
    issueDate: today,
    dueDate: addDays(today, 14),
    currency: "IDR",
    language: "id",
    template: "highlight",
    accentColor: "#5850EC",
    discountType: "none",
    discountValue: 0,
    notes: "Terima kasih",
    paymentAccountIds: [],
    items: [
      { name: "Retainer desain", description: "Bulanan", quantityMilli: 1000, unitPriceMinor: 1_500_000, unit: "bulan" },
      { name: "Hosting", description: "", quantityMilli: 1000, unitPriceMinor: 250_000, unit: "" },
    ],
  });
  return { invoice: await getInvoice(userId, draft.id), client };
}

const scheduleInput = (overrides: Record<string, unknown> = {}) => ({
  frequency: "monthly",
  interval: 1,
  nextRunOn: today,
  endType: "never",
  delivery: "draft",
  ...overrides,
});

async function newSchedule(owner: Owner, input: Record<string, unknown> = {}, existing?: Awaited<ReturnType<typeof sourceInvoice>>) {
  const { invoice: source, client } = existing ?? (await sourceInvoice(owner.id));
  return { schedule: await createSchedule(owner.id, source.id, scheduleInput(input)), source, client };
}

async function generated(scheduleId: string) {
  return testDb
    .select()
    .from(invoices)
    .where(eq(invoices.recurringScheduleId, scheduleId))
    .orderBy(asc(invoices.issueDate));
}

async function scheduleRow(id: string) {
  const [row] = await testDb.select().from(recurringSchedules).where(eq(recurringSchedules.id, id));
  return row;
}

async function events(invoiceId: string) {
  return testDb.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, invoiceId)).orderBy(asc(invoiceEvents.createdAt));
}

async function fieldErrors(promise: Promise<unknown>): Promise<Record<string, string[]> | undefined> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ValidationError) return e.fieldErrors;
    throw e;
  }
  return undefined;
}

beforeEach(async () => {
  await resetDb();
});

describe("runDueSchedules", () => {
  it("creates the next invoice as a draft with the source's items, a new number and an event", async () => {
    const owner = await setupOwner();
    const { schedule, source } = await newSchedule(owner);

    const result = await runDueSchedules(today, {});
    expect(result).toEqual({ processed: 1, created: 1, failed: 0, skipped: 0 });

    const [copy] = await generated(schedule.id);
    expect(copy.status).toBe("draft");
    expect(copy.number).not.toBe(source.number);
    expect(copy.number).toMatch(/^INV-\d{4}-002$/);
    expect(copy.issueDate).toBe(today);
    expect(copy.dueDate).toBe(addDays(today, 14));
    expect(copy.totalMinor).toBe(1_750_000);
    expect(copy.notes).toBe("Terima kasih");
    expect(copy.clientId).toBe(source.clientId);
    expect(copy.publicToken).not.toBe(source.publicToken);

    const full = await getInvoice(owner.id, copy.id);
    expect(full.items.map((i) => [i.name, i.unitPriceMinor, i.amountMinor, i.unit])).toEqual([
      ["Retainer desain", 1_500_000, 1_500_000, "bulan"],
      ["Hosting", 250_000, 250_000, null],
    ]);

    const row = await scheduleRow(schedule.id);
    expect(row.runsDone).toBe(1);
    expect(row.active).toBe(true);
    expect(row.nextRunOn).toBe(
      (await import("@/lib/recurrence")).nextRunDate(today, { frequency: "monthly", interval: 1, anchorDay: Number(today.slice(8)) }),
    );
    expect(row.lastError).toBeNull();

    const log = await events(copy.id);
    expect(log.map((e) => e.type)).toEqual(["recurring_generated"]);
    expect(log[0].meta).toEqual({ scheduleId: schedule.id, runDate: today });
  });

  it("sets the exchange rate of the new invoice like any other copy", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner);
    await runDueSchedules(today, {});
    const [copy] = await generated(schedule.id);
    expect(Number(copy.fxRateToBase)).toBe(1);
    expect(copy.fxRateDate).toBe(today);
    expect(copy.fxBaseCurrency).toBe("IDR");
  });

  it("freezes snapshots rebuilt from live data, not the source's old copies", async () => {
    const owner = await setupOwner();
    const { schedule, source, client } = await newSchedule(owner);
    await testDb.update(clients).set({ name: "PT Maju Mundur" }).where(eq(clients.id, client.id));
    await testDb.update(businessProfiles).set({ businessName: "Studio Baru" }).where(eq(businessProfiles.userId, owner.id));

    await runDueSchedules(today, {});
    const [copy] = await generated(schedule.id);
    expect(copy.clientSnapshot?.name).toBe("PT Maju Mundur");
    expect(copy.businessSnapshot.businessName).toBe("Studio Baru");
    const original = await getInvoice(owner.id, source.id);
    expect(original.clientSnapshot?.name).toBe("PT Maju Jaya");
  });

  it("does nothing for a schedule that is not due yet or is paused", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { nextRunOn: addDays(today, 1) });
    expect(await runDueSchedules(today, {})).toEqual({ processed: 0, created: 0, failed: 0, skipped: 0 });

    await testDb.update(recurringSchedules).set({ nextRunOn: today }).where(eq(recurringSchedules.id, schedule.id));
    await pauseSchedule(owner.id, schedule.id);
    expect(await runDueSchedules(today, {})).toEqual({ processed: 0, created: 0, failed: 0, skipped: 0 });
    expect(await generated(schedule.id)).toHaveLength(0);
  });

  it("is idempotent: a second run on the same day creates nothing", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner);
    await runDueSchedules(today, {});
    const second = await runDueSchedules(today, {});
    expect(second).toEqual({ processed: 0, created: 0, failed: 0, skipped: 0 });
    expect(await generated(schedule.id)).toHaveLength(1);
  });

  it("is idempotent under two concurrent runs", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner);
    const results = await Promise.all([runDueSchedules(today, {}), runDueSchedules(today, {})]);
    expect(results.reduce((n, r) => n + r.created, 0)).toBe(1);
    expect(await generated(schedule.id)).toHaveLength(1);
    expect((await scheduleRow(schedule.id)).runsDone).toBe(1);
  });

  it("treats a run date that already has an invoice (unique index) as generated, without burning a number", async () => {
    const owner = await setupOwner();
    const { schedule, source } = await newSchedule(owner);
    // An invoice for (schedule, today) exists already, e.g. from an interrupted earlier run.
    const draft = await createDraftInvoice(owner.id);
    await testDb
      .update(invoices)
      .set({ recurringScheduleId: schedule.id, issueDate: today })
      .where(eq(invoices.id, draft.id));
    const [before] = await testDb.select().from(businessProfiles).where(eq(businessProfiles.userId, owner.id));

    const result = await runDueSchedules(today, {});
    expect(result).toEqual({ processed: 1, created: 0, failed: 0, skipped: 0 });
    expect(await generated(schedule.id)).toHaveLength(1);
    const row = await scheduleRow(schedule.id);
    expect(row.runsDone).toBe(1);
    expect(row.nextRunOn > today).toBe(true);
    const [after] = await testDb.select().from(businessProfiles).where(eq(businessProfiles.userId, owner.id));
    expect(after.nextInvoiceNumber).toBe(before.nextInvoiceNumber);
    expect(source.id).not.toBe(draft.id);
  });

  it("catches up on missed runs, one invoice per date", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { frequency: "weekly" });
    await testDb
      .update(recurringSchedules)
      .set({ nextRunOn: addDays(today, -14), anchorDay: 1 })
      .where(eq(recurringSchedules.id, schedule.id));

    const result = await runDueSchedules(today, {});
    expect(result).toEqual({ processed: 1, created: 3, failed: 0, skipped: 0 });
    const copies = await generated(schedule.id);
    expect(copies.map((c) => c.issueDate)).toEqual([addDays(today, -14), addDays(today, -7), today]);
    expect(copies.map((c) => c.dueDate)).toEqual([addDays(today, 0), addDays(today, 7), addDays(today, 14)]);
    expect(new Set(copies.map((c) => c.number)).size).toBe(3);
    expect((await scheduleRow(schedule.id)).nextRunOn).toBe(addDays(today, 7));
  });

  it("creates at most 12 per execution and continues on the next one", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { frequency: "weekly" });
    await testDb
      .update(recurringSchedules)
      .set({ nextRunOn: addDays(today, -140) })
      .where(eq(recurringSchedules.id, schedule.id));

    expect((await runDueSchedules(today, {})).created).toBe(12);
    expect((await runDueSchedules(today, {})).created).toBe(9);
    expect((await runDueSchedules(today, {})).created).toBe(0);
    expect(await generated(schedule.id)).toHaveLength(21);
  });

  it("finishes a schedule after its count: active becomes false", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { endType: "after_count", endCount: 1 });
    await runDueSchedules(today, {});
    const row = await scheduleRow(schedule.id);
    expect(row.active).toBe(false);
    expect(row.runsDone).toBe(1);
    expect((await listSchedules(owner.id))[0].status).toBe("finished");
    expect(await runDueSchedules(addDays(today, 40), {})).toEqual({ processed: 0, created: 0, failed: 0, skipped: 0 });
  });

  it("never creates more than the count when behind schedule", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { frequency: "weekly", endType: "after_count", endCount: 2 });
    await testDb.update(recurringSchedules).set({ nextRunOn: addDays(today, -21) }).where(eq(recurringSchedules.id, schedule.id));
    expect((await runDueSchedules(today, {})).created).toBe(2);
    expect((await scheduleRow(schedule.id)).active).toBe(false);
  });

  it("stops at the end date", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { frequency: "weekly", endType: "on_date", endDate: addDays(today, 3) });
    await testDb.update(recurringSchedules).set({ nextRunOn: addDays(today, -7) }).where(eq(recurringSchedules.id, schedule.id));
    // Runs: today-7 and today; the run after that (today+7) is past the end date.
    expect((await runDueSchedules(today, {})).created).toBe(2);
    const row = await scheduleRow(schedule.id);
    expect(row.active).toBe(false);
    expect(row.nextRunOn).toBe(addDays(today, 7));
  });

  it("deactivates a schedule whose source was voided or deleted", async () => {
    const owner = await setupOwner();
    const first = await newSchedule(owner);
    const second = await newSchedule(owner);
    // Void a source (it must be sent first? a draft can be voided too).
    await voidInvoice(owner.id, first.source.id);
    await deleteInvoice(owner.id, second.source.id);

    const result = await runDueSchedules(today, {});
    expect(result).toEqual({ processed: 2, created: 0, failed: 0, skipped: 0 });
    for (const { schedule } of [first, second]) {
      const row = await scheduleRow(schedule.id);
      expect(row.active).toBe(false);
      expect(row.lastError).toBe("sourceUnavailable");
      expect(await generated(schedule.id)).toHaveLength(0);
    }
    const [deleted] = await testDb.select().from(recurringSchedules).where(eq(recurringSchedules.id, second.schedule.id));
    expect(deleted.sourceInvoiceId).toBeNull();
  });

  it("isolates failures: a broken schedule is recorded and the others still run", async () => {
    const owner = await setupOwner();
    const broken = await newSchedule(owner);
    const healthy = await newSchedule(owner);
    // A corrupt rule: the next date cannot be computed.
    await testDb.update(recurringSchedules).set({ interval: 0 }).where(eq(recurringSchedules.id, broken.schedule.id));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runDueSchedules(today, {});
    error.mockRestore();
    expect(result).toEqual({ processed: 2, created: 1, failed: 1, skipped: 0 });
    expect(await generated(healthy.schedule.id)).toHaveLength(1);
    expect(await generated(broken.schedule.id)).toHaveLength(0);
    const row = await scheduleRow(broken.schedule.id);
    expect(row.lastError).toBe("runFailed");
    expect(row.active).toBe(true);
  });

  it("rolls the whole schedule back when a run fails half way", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { frequency: "weekly" });
    // 2 dates due; the profile row vanishes before the 2nd would be... simulate with a missing profile.
    await testDb.update(recurringSchedules).set({ nextRunOn: addDays(today, -7) }).where(eq(recurringSchedules.id, schedule.id));
    await testDb.delete(businessProfiles).where(eq(businessProfiles.userId, owner.id));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runDueSchedules(today, {});
    error.mockRestore();
    expect(result.failed).toBe(1);
    expect(await generated(schedule.id)).toHaveLength(0);
    expect((await scheduleRow(schedule.id)).runsDone).toBe(0);
  });
});

describe("runDueSchedules with auto_email", () => {
  it("sends the generated invoice by email and marks it sent", async () => {
    const owner = await setupOwner({ verified: true });
    const { schedule } = await newSchedule(owner, { delivery: "auto_email" });
    const { transport, sent } = recordingTransport();

    const result = await runDueSchedules(today, { transport, renderPdf });
    expect(result).toEqual({ processed: 1, created: 1, failed: 0, skipped: 0 });
    const [copy] = await generated(schedule.id);
    expect(copy.status).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["billing@majujaya.test"]);
    expect(sent[0].replyTo).toBe(owner.email);
    expect(sent[0].subject).toContain(copy.number);
    expect(sent[0].attachments?.[0].filename).toContain(copy.number);
    expect(sent[0].text).toContain(`/i/${copy.publicToken}`);
    expect((await events(copy.id)).map((e) => e.type)).toEqual(["recurring_generated", "sent", "sent_email"]);
    expect((await scheduleRow(schedule.id)).lastError).toBeNull();
  });

  it("keeps a draft and records the reason when the owner is not verified", async () => {
    const owner = await setupOwner({ verified: false });
    const { schedule } = await newSchedule(owner, { delivery: "auto_email" });
    const { transport, sent } = recordingTransport();

    const result = await runDueSchedules(today, { transport, renderPdf });
    expect(result).toEqual({ processed: 1, created: 1, failed: 0, skipped: 0 });
    const [copy] = await generated(schedule.id);
    expect(copy.status).toBe("draft");
    expect(sent).toHaveLength(0);
    expect((await scheduleRow(schedule.id)).lastError).toBe("emailNotVerified");
    const log = await events(copy.id);
    expect(log.map((e) => e.type)).toEqual(["recurring_generated", "email_failed"]);
    expect(log[1].meta).toEqual({ error: "emailNotVerified" });
  });

  it("keeps a draft when the client has no email or the transport is disabled", async () => {
    const owner = await setupOwner();
    const noEmail = await sourceInvoice(owner.id, { clientEmail: null });
    const a = await newSchedule(owner, { delivery: "auto_email" }, noEmail);
    const { transport, sent } = recordingTransport();
    await runDueSchedules(today, { transport, renderPdf });
    expect((await generated(a.schedule.id))[0].status).toBe("draft");
    expect((await scheduleRow(a.schedule.id)).lastError).toBe("clientEmailMissing");

    const b = await newSchedule(owner, { delivery: "auto_email" });
    const disabled = recordingTransport("disabled");
    await runDueSchedules(today, { transport: disabled.transport, renderPdf });
    expect((await generated(b.schedule.id))[0].status).toBe("draft");
    expect((await scheduleRow(b.schedule.id)).lastError).toBe("emailDisabled");
    // Only the owner's summary of the stuck draft went out, never the invoice itself.
    expect(sent.filter((e) => e.attachments)).toHaveLength(0);
    expect(disabled.sent).toHaveLength(0);
  });

  it("keeps the generated invoice (draft) when delivery fails, and logs email_failed once", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { delivery: "auto_email" });
    const { transport } = recordingTransport("file", new Error("smtp down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runDueSchedules(today, { transport, renderPdf });
    error.mockRestore();
    expect(result).toEqual({ processed: 1, created: 1, failed: 0, skipped: 0 });
    const [copy] = await generated(schedule.id);
    expect(copy.status).toBe("draft");
    expect((await scheduleRow(schedule.id)).lastError).toBe("emailFailed");
    const failed = (await events(copy.id)).filter((e) => e.type === "email_failed");
    expect(failed).toHaveLength(1);
  });

  it("uses an injected sender and survives it throwing", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { delivery: "auto_email" });
    const { transport } = recordingTransport();
    const sendInvoiceEmail = vi.fn().mockRejectedValue(new Error("boom"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runDueSchedules(today, { transport, renderPdf, sendInvoiceEmail });
    error.mockRestore();
    expect(sendInvoiceEmail).toHaveBeenCalledTimes(1);
    expect(sendInvoiceEmail.mock.calls[0][0]).toMatchObject({ id: owner.id, emailVerified: true });
    expect(result.created).toBe(1);
    expect((await generated(schedule.id))[0].status).toBe("draft");
    expect((await scheduleRow(schedule.id)).lastError).toBe("emailFailed");
  });
});

async function invoiceRow(id: string) {
  const [row] = await testDb.select().from(invoices).where(eq(invoices.id, id));
  return row;
}

/** A sender that answers after `ms` milliseconds without sending anything. */
const slowSender = (ms: number) => vi.fn(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));
const neverSender = () => vi.fn(() => new Promise<void>(() => {}));

describe("auto_email delivery is durable", () => {
  it("flags the invoice as pending in the generating transaction and clears the flag once the email is out", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { delivery: "auto_email" });
    let flaggedWhenSending: number | null = null;
    const transport: EmailTransport = {
      kind: "file",
      async send(email) {
        // The invoice summary mail has no attachment; the invoice mail does.
        if (email.attachments) {
          flaggedWhenSending = (await testDb.select().from(invoices).where(eq(invoices.emailPending, true))).length;
        }
        return { id: "1" };
      },
    };

    await runDueSchedules(today, { transport, renderPdf });
    expect(flaggedWhenSending).toBe(1);
    const [copy] = await generated(schedule.id);
    expect(copy.status).toBe("sent");
    expect(copy.emailPending).toBe(false);
  });

  it("does not flag the invoices of a draft-delivery schedule", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { delivery: "draft" });
    await runDueSchedules(today, {});
    expect((await generated(schedule.id))[0].emailPending).toBe(false);
  });

  it("delivers what an interrupted run left behind at the start of the next run", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { delivery: "auto_email" });
    // The first run is cut off while sending (a sender that never answers, the run deadline hits).
    const first = await runDueSchedules(today, { transport: recordingTransport().transport, renderPdf, sendInvoiceEmail: neverSender(), budgetMs: 100, graceMs: 100 });
    expect(first).toMatchObject({ processed: 1, created: 1, failed: 0, skipped: 1 });
    const [stuck] = await generated(schedule.id);
    expect(stuck.status).toBe("draft");
    expect(stuck.emailPending).toBe(true);

    // The next run finds nothing due, but sends the pending invoice first.
    const { transport, sent } = recordingTransport();
    const second = await runDueSchedules(today, { transport, renderPdf });
    expect(second).toEqual({ processed: 0, created: 0, failed: 0, skipped: 0 });
    const invoice = await invoiceRow(stuck.id);
    expect(invoice.status).toBe("sent");
    expect(invoice.emailPending).toBe(false);
    expect(sent.filter((e) => e.attachments)).toHaveLength(1);
    expect(sent.find((e) => e.attachments)!.to).toEqual(["billing@majujaya.test"]);
    expect((await events(stuck.id)).map((e) => e.type)).toContain("sent_email");
  });

  it("keeps a failed delivery pending, records email_failed and the schedule error, and retries it next run", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { delivery: "auto_email" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await runDueSchedules(today, { transport: recordingTransport("file", new Error("smtp down")).transport, renderPdf });
    const [copy] = await generated(schedule.id);
    expect(copy.emailPending).toBe(true);
    expect((await scheduleRow(schedule.id)).lastError).toBe("emailFailed");

    // Still down at the start of the next run: one more email_failed, still pending.
    await runDueSchedules(today, { transport: recordingTransport("file", new Error("smtp down")).transport, renderPdf });
    error.mockRestore();
    expect((await events(copy.id)).filter((e) => e.type === "email_failed")).toHaveLength(2);
    expect((await invoiceRow(copy.id)).emailPending).toBe(true);
    expect((await scheduleRow(schedule.id)).lastError).toBe("emailFailed");

    // Back up: delivered, flag and the schedule's email error cleared.
    const { transport, sent } = recordingTransport();
    await runDueSchedules(today, { transport, renderPdf });
    expect(sent.filter((e) => e.attachments)).toHaveLength(1);
    expect((await invoiceRow(copy.id)).status).toBe("sent");
    expect((await invoiceRow(copy.id)).emailPending).toBe(false);
    expect((await scheduleRow(schedule.id)).lastError).toBeNull();
  });

  it("drops the flag without sending when the owner is no longer eligible, leaving a draft and the reason", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { delivery: "auto_email" });
    await runDueSchedules(today, { transport: recordingTransport("file", new Error("smtp down")).transport, renderPdf }).catch(() => {});
    const [copy] = await generated(schedule.id);
    expect(copy.emailPending).toBe(true);

    await testDb.update(user).set({ emailVerified: false }).where(eq(user.id, owner.id));
    const { transport, sent } = recordingTransport();
    await runDueSchedules(today, { transport, renderPdf });
    expect(sent.filter((e) => e.attachments)).toHaveLength(0);
    expect((await invoiceRow(copy.id)).emailPending).toBe(false);
    expect((await invoiceRow(copy.id)).status).toBe("draft");
    expect((await scheduleRow(schedule.id)).lastError).toBe("emailNotVerified");
  });

  it("does not send a pending invoice that was sent or voided by hand, or whose schedule was stopped", async () => {
    const owner = await setupOwner();
    const a = await newSchedule(owner, { delivery: "auto_email" });
    const b = await newSchedule(owner, { delivery: "auto_email" });
    const c = await newSchedule(owner, { delivery: "auto_email" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await runDueSchedules(today, { transport: recordingTransport("file", new Error("down")).transport, renderPdf });
    error.mockRestore();
    const [copyA] = await generated(a.schedule.id);
    const [copyB] = await generated(b.schedule.id);
    const [copyC] = await generated(c.schedule.id);

    await markSent(owner.id, copyA.id, "manual");
    await voidInvoice(owner.id, copyB.id);
    await deleteSchedule(owner.id, c.schedule.id);

    const { transport, sent } = recordingTransport();
    await runDueSchedules(today, { transport, renderPdf });
    expect(sent.filter((e) => e.attachments)).toHaveLength(0);
    for (const copy of [copyA, copyB, copyC]) expect((await invoiceRow(copy.id)).emailPending).toBe(false);
    expect((await invoiceRow(copyC.id)).status).toBe("draft");
  });

  it("gives up on a pending delivery after three days", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { delivery: "auto_email" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await runDueSchedules(today, { transport: recordingTransport("file", new Error("down")).transport, renderPdf });
    error.mockRestore();
    const [copy] = await generated(schedule.id);
    await testDb.update(invoices).set({ createdAt: new Date(Date.now() - 4 * 86_400_000) }).where(eq(invoices.id, copy.id));

    const { transport, sent } = recordingTransport();
    await runDueSchedules(today, { transport, renderPdf });
    expect(sent.filter((e) => e.attachments)).toHaveLength(0);
    expect((await invoiceRow(copy.id)).emailPending).toBe(false);
    expect((await invoiceRow(copy.id)).status).toBe("draft");
  });
});

describe("auto_email catch-up", () => {
  it("emails only the invoice of the most recent run date; earlier ones stay drafts", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { frequency: "weekly", delivery: "auto_email" });
    await testDb.update(recurringSchedules).set({ nextRunOn: addDays(today, -14) }).where(eq(recurringSchedules.id, schedule.id));
    const { transport, sent } = recordingTransport();

    const result = await runDueSchedules(today, { transport, renderPdf });
    expect(result).toMatchObject({ processed: 1, created: 3, failed: 0 });
    const copies = await generated(schedule.id);
    expect(copies.map((c) => c.status)).toEqual(["draft", "draft", "sent"]);
    expect(copies.map((c) => c.issueDate)).toEqual([addDays(today, -14), addDays(today, -7), today]);
    expect(copies.every((c) => !c.emailPending)).toBe(true);
    const invoiceMails = sent.filter((e) => e.attachments);
    expect(invoiceMails).toHaveLength(1);
    expect(invoiceMails[0].subject).toContain(copies[2].number);
  });

  it("waits until the schedule has caught up before emailing when a run hits the cap of 12", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { frequency: "weekly", delivery: "auto_email" });
    await testDb.update(recurringSchedules).set({ nextRunOn: addDays(today, -98) }).where(eq(recurringSchedules.id, schedule.id));
    const { transport, sent } = recordingTransport();

    expect((await runDueSchedules(today, { transport, renderPdf })).created).toBe(12);
    expect(sent.filter((e) => e.attachments)).toHaveLength(0);

    expect((await runDueSchedules(today, { transport, renderPdf })).created).toBe(3);
    const copies = await generated(schedule.id);
    expect(copies).toHaveLength(15);
    expect(copies.filter((c) => c.status === "sent").map((c) => c.issueDate)).toEqual([today]);
    expect(sent.filter((e) => e.attachments)).toHaveLength(1);
  });
});

describe("the run deadline", () => {
  it("starts no new work once the budget is used up, reports what it skipped, and the next run does it", async () => {
    const owner = await setupOwner();
    const a = await newSchedule(owner);
    await newSchedule(owner);

    const result = await runDueSchedules(today, { budgetMs: 0 });
    expect(result).toEqual({ processed: 0, created: 0, failed: 0, skipped: 2 });
    expect(await generated(a.schedule.id)).toHaveLength(0);
    expect((await scheduleRow(a.schedule.id)).nextRunOn).toBe(today);

    const next = await runDueSchedules(today, {});
    expect(next).toEqual({ processed: 2, created: 2, failed: 0, skipped: 0 });
  });

  it("stops after the schedule in progress when the budget runs out during a slow delivery", async () => {
    const owner = await setupOwner();
    const a = await newSchedule(owner, { delivery: "auto_email" });
    await newSchedule(owner, { delivery: "auto_email" });
    await newSchedule(owner, { delivery: "auto_email" });
    const sender = slowSender(150);

    const result = await runDueSchedules(today, { transport: recordingTransport().transport, renderPdf, sendInvoiceEmail: sender, budgetMs: 100 });
    expect(result).toEqual({ processed: 1, created: 1, failed: 0, skipped: 2 });
    expect(sender).toHaveBeenCalledTimes(1);
    expect(await generated(a.schedule.id)).toHaveLength(1);

    // The leftovers are picked up by the next run.
    const next = await runDueSchedules(today, { transport: recordingTransport().transport, renderPdf, sendInvoiceEmail: slowSender(1) });
    expect(next).toMatchObject({ processed: 2, created: 2, skipped: 0 });
  });

  it("does not wait for a delivery that never answers beyond the grace period", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { delivery: "auto_email" });
    const started = Date.now();
    const result = await runDueSchedules(today, { transport: recordingTransport().transport, renderPdf, sendInvoiceEmail: neverSender(), budgetMs: 50, graceMs: 100 });
    expect(Date.now() - started).toBeLessThan(3000);
    expect(result).toMatchObject({ created: 1, failed: 0, skipped: 1 });
    expect((await generated(schedule.id))[0].emailPending).toBe(true);
  });
});

describe("consecutive failures", () => {
  async function breakSchedule(id: string) {
    await testDb.update(recurringSchedules).set({ interval: 0 }).where(eq(recurringSchedules.id, id));
  }

  it("counts failed runs, deactivates the schedule after the 7th with a reason, and stops retrying it", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner);
    await breakSchedule(schedule.id);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    for (let run = 1; run <= 6; run++) {
      await runDueSchedules(today, {});
      const row = await scheduleRow(schedule.id);
      expect(row).toMatchObject({ failedRuns: run, active: true, lastError: "runFailed" });
    }
    const seventh = await runDueSchedules(today, {});
    expect(seventh).toMatchObject({ processed: 1, failed: 1 });
    expect(await scheduleRow(schedule.id)).toMatchObject({ failedRuns: 7, active: false, lastError: "tooManyFailures" });

    const eighth = await runDueSchedules(today, {});
    error.mockRestore();
    expect(eighth).toEqual({ processed: 0, created: 0, failed: 0, skipped: 0 });
  });

  it("resets the counter after a clean run", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner);
    await breakSchedule(schedule.id);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (let run = 0; run < 3; run++) await runDueSchedules(today, {});
    error.mockRestore();
    expect((await scheduleRow(schedule.id)).failedRuns).toBe(3);

    await testDb.update(recurringSchedules).set({ interval: 1 }).where(eq(recurringSchedules.id, schedule.id));
    await runDueSchedules(today, {});
    expect(await scheduleRow(schedule.id)).toMatchObject({ failedRuns: 0, lastError: null, active: true });
  });

  it("can be resumed after being stopped for failures, which clears the counter and the error", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner);
    await testDb
      .update(recurringSchedules)
      .set({ active: false, failedRuns: 7, lastError: "tooManyFailures" })
      .where(eq(recurringSchedules.id, schedule.id));
    const resumed = await resumeSchedule(owner.id, schedule.id);
    expect(resumed).toMatchObject({ active: true, failedRuns: 0, lastError: null });
  });
});

describe("owner summary email after a run", () => {
  const unverifiedOk = () => recordingTransport();

  it("sends one summary to the owner for the drafts the run created, with links built from the app URL", async () => {
    const owner = await setupOwner();
    const a = await newSchedule(owner);
    const b = await newSchedule(owner);
    const { transport, sent } = unverifiedOk();

    const result = await runDueSchedules(today, { transport, renderPdf });
    expect(result.created).toBe(2);

    expect(sent).toHaveLength(1);
    const [email] = sent;
    expect(email.to).toEqual([owner.email]);
    expect(email.subject).toBe("2 invoice berulang siap dikirim");
    const numbers = [...(await generated(a.schedule.id)), ...(await generated(b.schedule.id))].map((i) => i.number);
    for (const number of numbers) expect(email.text).toContain(number);
    expect(email.text).toContain("PT Maju Jaya");
    expect(email.html).toContain("/invoices?tab=draft");
    expect(email.text).toContain("/invoices?tab=draft");
  });

  it("sends one email per owner", async () => {
    const one = await setupOwner();
    const two = await setupOwner();
    await newSchedule(one);
    await newSchedule(two);
    const { transport, sent } = unverifiedOk();
    await runDueSchedules(today, { transport, renderPdf });
    expect(sent.map((e) => e.to[0]).sort()).toEqual([one.email, two.email].sort());
  });

  it("includes an auto_email invoice that stayed a draft, but not one that was sent", async () => {
    const owner = await setupOwner();
    const noEmail = await sourceInvoice(owner.id, { clientEmail: null });
    const stuck = await newSchedule(owner, { delivery: "auto_email" }, noEmail);
    const fine = await newSchedule(owner, { delivery: "auto_email" });
    const { transport, sent } = unverifiedOk();

    await runDueSchedules(today, { transport, renderPdf });
    const invoicesSent = sent.filter((e) => e.attachments);
    expect(invoicesSent).toHaveLength(1);
    const summaries = sent.filter((e) => !e.attachments);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].subject).toBe("1 invoice berulang siap dikirim");
    expect(summaries[0].text).toContain((await generated(stuck.schedule.id))[0].number);
    expect(summaries[0].text).not.toContain((await generated(fine.schedule.id))[0].number);
  });

  it("sends nothing when no invoice was created, the owner is not verified or email is disabled", async () => {
    const owner = await setupOwner();
    const { transport, sent } = unverifiedOk();
    await runDueSchedules(today, { transport, renderPdf });
    expect(sent).toHaveLength(0);

    const unverified = await setupOwner({ verified: false });
    await newSchedule(unverified);
    await runDueSchedules(today, { transport, renderPdf });
    expect(sent).toHaveLength(0);

    await newSchedule(owner);
    const disabled = recordingTransport("disabled");
    await runDueSchedules(addDays(today, 40), { transport: disabled.transport, renderPdf });
    expect(disabled.sent).toHaveLength(0);
  });

  it("never throws: a failing transport leaves the run result untouched", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner);
    const { transport } = recordingTransport("file", new Error("smtp down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await runDueSchedules(today, { transport, renderPdf });
    error.mockRestore();
    expect(result).toEqual({ processed: 1, created: 1, failed: 0, skipped: 0 });
    expect((await generated(schedule.id))[0].status).toBe("draft");
    expect((await scheduleRow(schedule.id)).lastError).toBeNull();
  });
});

describe("schedule queries", () => {
  it("creates a schedule with the anchor day of the first run", async () => {
    const owner = await setupOwner();
    const start = addDays(today, 30);
    const { schedule, source } = await newSchedule(owner, { nextRunOn: start, endType: "after_count", endCount: "6" });
    expect(schedule).toMatchObject({
      sourceInvoiceId: source.id,
      frequency: "monthly",
      interval: 1,
      anchorDay: Number(start.slice(8)),
      nextRunOn: start,
      endType: "after_count",
      endCount: 6,
      endDate: null,
      runsDone: 0,
      delivery: "draft",
      active: true,
      lastError: null,
    });
    expect(await getScheduleForInvoice(owner.id, source.id)).toMatchObject({ id: schedule.id });
  });

  it("allows one schedule per source invoice", async () => {
    const owner = await setupOwner();
    const { source } = await newSchedule(owner);
    expect(await fieldErrors(createSchedule(owner.id, source.id, scheduleInput()))).toEqual({ _form: ["scheduleExists"] });
  });

  it("refuses a void source", async () => {
    const owner = await setupOwner();
    const { invoice } = await sourceInvoice(owner.id);
    await markSent(owner.id, invoice.id, "manual");
    await voidInvoice(owner.id, invoice.id);
    expect(await fieldErrors(createSchedule(owner.id, invoice.id, scheduleInput()))).toEqual({ _form: ["invalidTransition"] });
  });

  it("validates the input", async () => {
    const owner = await setupOwner();
    const { invoice } = await sourceInvoice(owner.id);
    const errors = (input: Record<string, unknown>) => fieldErrors(createSchedule(owner.id, invoice.id, scheduleInput(input)));
    expect(await errors({ nextRunOn: addDays(today, -1) })).toEqual({ nextRunOn: ["dateInPast"] });
    expect(await errors({ interval: 13 })).toHaveProperty("interval");
    expect(await errors({ interval: 0 })).toHaveProperty("interval");
    expect(await errors({ frequency: "daily" })).toHaveProperty("frequency");
    expect(await errors({ delivery: "sms" })).toHaveProperty("delivery");
    expect(await errors({ endType: "after_count" })).toEqual({ endCount: ["required"] });
    expect(await errors({ endType: "after_count", endCount: 121 })).toHaveProperty("endCount");
    expect(await errors({ endType: "on_date" })).toEqual({ endDate: ["required"] });
    expect(await errors({ endType: "on_date", endDate: today })).toEqual({ endDate: ["endNotAfterStart"] });
    expect(await errors({ nextRunOn: "2026-02-30" })).toHaveProperty("nextRunOn");
    expect(await getScheduleForInvoice(owner.id, invoice.id)).toBeNull();
  });

  it("ignores the end fields that do not apply to the end type", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { endType: "never", endCount: 5, endDate: addDays(today, 90) });
    expect(schedule).toMatchObject({ endType: "never", endCount: null, endDate: null });
  });

  it("updates, pauses, resumes and deletes", async () => {
    const owner = await setupOwner();
    const { schedule, source } = await newSchedule(owner);
    await testDb.update(recurringSchedules).set({ lastError: "emailFailed" }).where(eq(recurringSchedules.id, schedule.id));

    const start = addDays(today, 10);
    const updated = await updateSchedule(owner.id, schedule.id, scheduleInput({ frequency: "yearly", interval: 2, nextRunOn: start, delivery: "auto_email" }));
    expect(updated).toMatchObject({ frequency: "yearly", interval: 2, nextRunOn: start, delivery: "auto_email", lastError: null, anchorDay: Number(start.slice(8)) });
    expect(await fieldErrors(updateSchedule(owner.id, schedule.id, scheduleInput({ interval: 99 })))).toHaveProperty("interval");

    expect((await pauseSchedule(owner.id, schedule.id)).active).toBe(false);
    expect((await listSchedules(owner.id))[0].status).toBe("paused");
    expect((await resumeSchedule(owner.id, schedule.id)).active).toBe(true);

    await deleteSchedule(owner.id, schedule.id);
    expect(await getScheduleForInvoice(owner.id, source.id)).toBeNull();
    // The source can be scheduled again.
    await createSchedule(owner.id, source.id, scheduleInput());
  });

  it("resumes at the first run from today without catching up on what it missed", async () => {
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner, { frequency: "weekly" });
    await pauseSchedule(owner.id, schedule.id);
    await testDb.update(recurringSchedules).set({ nextRunOn: addDays(today, -20) }).where(eq(recurringSchedules.id, schedule.id));

    const resumed = await resumeSchedule(owner.id, schedule.id);
    expect(resumed.nextRunOn >= today).toBe(true);
    expect(resumed.nextRunOn <= addDays(today, 6)).toBe(true);
    // -20 + 21 = +1: still on the weekly grid.
    expect(resumed.nextRunOn).toBe(addDays(today, 1));
    expect((await runDueSchedules(today, {})).created).toBe(0);
  });

  it("does not resume a finished schedule or one whose source is void", async () => {
    const owner = await setupOwner();
    const finished = await newSchedule(owner, { endType: "after_count", endCount: 1 });
    await runDueSchedules(today, {});
    expect(await fieldErrors(resumeSchedule(owner.id, finished.schedule.id))).toEqual({ _form: ["scheduleFinished"] });

    const voided = await newSchedule(owner);
    await pauseSchedule(owner.id, voided.schedule.id);
    await voidInvoice(owner.id, voided.source.id);
    expect(await fieldErrors(resumeSchedule(owner.id, voided.schedule.id))).toEqual({ _form: ["invalidTransition"] });
  });

  it("lists schedules with the source's number, client and total, for the owner only", async () => {
    const owner = await setupOwner();
    const other = await setupOwner();
    const { schedule, source } = await newSchedule(owner);
    await newSchedule(other);

    const rows = await listSchedules(owner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: schedule.id,
      status: "active",
      sourceNumber: source.number,
      clientName: "PT Maju Jaya",
      currency: "IDR",
      totalMinor: 1_750_000,
    });
  });

  it("hides other users' schedules and invoices (NotFound)", async () => {
    const owner = await setupOwner();
    const intruder = await setupOwner();
    const { schedule, source } = await newSchedule(owner);

    await expect(updateSchedule(intruder.id, schedule.id, scheduleInput())).rejects.toBeInstanceOf(NotFoundError);
    await expect(pauseSchedule(intruder.id, schedule.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(resumeSchedule(intruder.id, schedule.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteSchedule(intruder.id, schedule.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getScheduleForInvoice(intruder.id, source.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createSchedule(intruder.id, source.id, scheduleInput())).rejects.toBeInstanceOf(NotFoundError);
    await expect(pauseSchedule(owner.id, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);
    expect((await scheduleRow(schedule.id)).active).toBe(true);
  });
});

describe("GET /api/cron/recurring", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  async function call(headers: Record<string, string> = {}) {
    const { GET } = await import("@/app/api/cron/recurring/route");
    return GET(new Request("http://localhost/api/cron/recurring", { headers }));
  }

  it("answers 401 without the secret and has no side effects", async () => {
    process.env.CRON_SECRET = "cron-secret-for-tests";
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner);

    expect((await call()).status).toBe(401);
    expect((await call({ authorization: "Bearer wrong" })).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await call({ authorization: "Bearer cron-secret-for-tests" })).status).toBe(401);
    expect(await generated(schedule.id)).toHaveLength(0);
  });

  it("runs the due schedules with the right secret and reports the counts", async () => {
    process.env.CRON_SECRET = "cron-secret-for-tests";
    const owner = await setupOwner();
    const { schedule } = await newSchedule(owner);

    const response = await call({ authorization: "Bearer cron-secret-for-tests" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ processed: 1, created: 1, failed: 0, skipped: 0 });
    expect(await generated(schedule.id)).toHaveLength(1);

    const again = await call({ authorization: "Bearer cron-secret-for-tests" });
    expect(await again.json()).toEqual({ processed: 0, created: 0, failed: 0, skipped: 0 });
    expect(await generated(schedule.id)).toHaveLength(1);
  });
});
