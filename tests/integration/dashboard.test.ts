import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { businessProfiles, invoices, paymentClaims, recurringSchedules } from "@/db/schema";
import { countRecurringDrafts, getDashboardSummary } from "@/features/dashboard/queries";
import { saveRates } from "@/features/fx/queries";
import { countInvoicesByTab, createDraftInvoice, listInvoices } from "@/features/invoices/queries";
import { ensureProfile, getChecklist, hasSentInvoice } from "@/features/profile/queries";
import { createTestUser, resetDb, testDb } from "./helpers";

const TODAY = "2026-10-21";

type Spec = {
  status: "draft" | "sent" | "payment_claimed" | "paid" | "void";
  currency?: string;
  total: number;
  due?: string;
  paidAt?: string;
  /** `fxRateToBase` stored on the invoice (units of the base currency per unit of `currency`); none by default. */
  fx?: string;
  fxDate?: string;
  /** The base currency `fx` was computed against; "IDR" by default (the default profile base). */
  fxBase?: string;
  issueDate?: string;
};

async function setupUser(baseCurrency = "IDR") {
  const u = await createTestUser();
  await ensureProfile(u.id, { businessName: "Studio Donny", email: "donny@example.test" });
  await testDb.update(businessProfiles).set({ invoicePrefix: "INV-", baseCurrency }).where(eq(businessProfiles.userId, u.id));
  return u;
}

/** A draft invoice turned into the wanted state straight in the database. */
async function makeInvoice(userId: string, spec: Spec) {
  const draft = await createDraftInvoice(userId);
  await testDb
    .update(invoices)
    .set({
      status: spec.status,
      currency: spec.currency ?? "IDR",
      subtotalMinor: spec.total,
      totalMinor: spec.total,
      ...(spec.issueDate ? { issueDate: spec.issueDate } : {}),
      dueDate: spec.due ?? "2026-11-01",
      fxRateToBase: spec.fx ?? null,
      fxRateDate: spec.fx ? (spec.fxDate ?? "2026-10-20") : null,
      fxBaseCurrency: spec.fx ? (spec.fxBase ?? "IDR") : null,
      paidAt: spec.paidAt ? new Date(spec.paidAt) : null,
      sentAt: spec.status === "draft" ? null : new Date("2026-10-01T00:00:00Z"),
    })
    .where(eq(invoices.id, draft.id));
  return draft;
}

/** The scenario of the brief plus a EUR invoice, a draft, a void one and month-boundary payments. */
async function seed(userId: string) {
  const a = await makeInvoice(userId, { status: "sent", total: 1_000_000 });
  const b = await makeInvoice(userId, { status: "payment_claimed", total: 500_000, due: "2026-10-10" });
  await makeInvoice(userId, { status: "sent", currency: "USD", total: 125_000 });
  await makeInvoice(userId, { status: "sent", currency: "EUR", total: 10_000 });
  await makeInvoice(userId, { status: "paid", total: 2_000_000, paidAt: "2026-10-05T00:00:00Z" });
  await makeInvoice(userId, { status: "paid", total: 300_000, paidAt: "2026-09-15T00:00:00Z" });
  // 2026-10-01 00:00 WIB is the first instant of this month; one second earlier is still September.
  await makeInvoice(userId, { status: "paid", total: 70_000, paidAt: "2026-09-30T17:00:00Z" });
  await makeInvoice(userId, { status: "paid", total: 900_000, paidAt: "2026-09-30T16:59:59Z" });
  await makeInvoice(userId, { status: "draft", total: 123 });
  await makeInvoice(userId, { status: "void", total: 456 });
  await testDb.insert(paymentClaims).values({ invoiceId: b.id, payerName: "Budi", paidOn: "2026-10-20", amountMinor: 500_000 });
  return { a, b };
}

describe("dashboard summary", () => {
  beforeEach(resetDb);

  it("totals unpaid, overdue and paid-this-month in the base currency; currencies without a rate are listed apart", async () => {
    const u = await setupUser("IDR");
    await seed(u.id);

    const summary = await getDashboardSummary(u.id, TODAY);

    // No rates anywhere: only IDR counts towards the total, EUR and USD wait without a rate.
    expect(summary.unpaid).toEqual({
      baseCurrency: "IDR",
      totalBaseMinor: 1_500_000,
      converted: false,
      rateDate: null,
      withoutRate: [
        { currency: "EUR", totalMinor: 10_000, count: 1 },
        { currency: "USD", totalMinor: 125_000, count: 1 },
      ],
      count: 4,
    });
    expect(summary.overdue).toEqual({
      baseCurrency: "IDR",
      totalBaseMinor: 500_000,
      converted: false,
      rateDate: null,
      withoutRate: [],
      count: 1,
    });
    // Calendar month in Jakarta: 05 Oct and the first instant of October count; September ones do not.
    expect(summary.paidThisMonth).toMatchObject({ totalBaseMinor: 2_070_000, withoutRate: [], count: 2 });
    expect(summary.pendingClaims).toBe(1);
  });

  it("converts other currencies with the rate stored on each invoice", async () => {
    const u = await setupUser("IDR");
    await makeInvoice(u.id, { status: "sent", total: 1_000_000 });
    await makeInvoice(u.id, { status: "sent", currency: "USD", total: 10_000, fx: "15000", fxDate: "2026-10-20" });

    const { unpaid } = await getDashboardSummary(u.id, TODAY);
    expect(unpaid.totalBaseMinor).toBe(2_500_000);
    expect(unpaid.converted).toBe(true);
    expect(unpaid.rateDate).toBe("2026-10-20");
    expect(unpaid.withoutRate).toEqual([]);
    expect(unpaid.count).toBe(2);
  });

  it("converts every invoice with its own rate, overdue and paid-this-month included, and reports the newest rate date", async () => {
    const u = await setupUser("IDR");
    await makeInvoice(u.id, { status: "sent", currency: "USD", total: 10_000, fx: "15000", fxDate: "2026-10-10", due: "2026-10-01" });
    await makeInvoice(u.id, { status: "sent", currency: "USD", total: 10_000, fx: "16000", fxDate: "2026-10-20" });
    await makeInvoice(u.id, { status: "paid", currency: "USD", total: 5_050, fx: "15000.5", paidAt: "2026-10-05T00:00:00Z" });

    const summary = await getDashboardSummary(u.id, TODAY);
    expect(summary.unpaid).toMatchObject({ totalBaseMinor: 1_500_000 + 1_600_000, converted: true, rateDate: "2026-10-20" });
    expect(summary.overdue).toMatchObject({ totalBaseMinor: 1_500_000, converted: true, rateDate: "2026-10-10", count: 1 });
    // 50.50 USD * 15000.5 = 757,525.25 -> Rp 757.525
    expect(summary.paidThisMonth).toMatchObject({ totalBaseMinor: 757_525, converted: true });
  });

  it("puts an invoice without a rate in withoutRate when there is no rate table either", async () => {
    const u = await setupUser("IDR");
    await makeInvoice(u.id, { status: "sent", total: 1_000_000 });
    await makeInvoice(u.id, { status: "sent", currency: "USD", total: 12_000 });
    await makeInvoice(u.id, { status: "sent", currency: "USD", total: 3_000 });

    const { unpaid } = await getDashboardSummary(u.id, TODAY);
    expect(unpaid.totalBaseMinor).toBe(1_000_000);
    expect(unpaid.converted).toBe(false);
    expect(unpaid.rateDate).toBeNull();
    expect(unpaid.withoutRate).toEqual([{ currency: "USD", totalMinor: 15_000, count: 2 }]);
    expect(unpaid.count).toBe(3);
  });

  it("falls back to the latest rates for an invoice stored without a rate", async () => {
    await saveRates("2026-10-20", { EUR: "1", USD: "1.08", IDR: "17000" });
    const u = await setupUser("IDR");
    await makeInvoice(u.id, { status: "sent", currency: "USD", total: 100 });
    await makeInvoice(u.id, { status: "sent", currency: "THB", total: 5_000 });

    const { unpaid } = await getDashboardSummary(u.id, TODAY);
    // USD 1.00 -> 17000 / 1.08 = 15740.74 -> Rp 15.741; THB is missing from the table.
    expect(unpaid.totalBaseMinor).toBe(15_741);
    expect(unpaid.converted).toBe(true);
    expect(unpaid.rateDate).toBe("2026-10-20");
    expect(unpaid.withoutRate).toEqual([{ currency: "THB", totalMinor: 5_000, count: 1 }]);
  });

  it("converts into a two-decimal base currency and ignores the stored rate of base-currency invoices", async () => {
    const u = await setupUser("USD");
    await makeInvoice(u.id, { status: "sent", currency: "USD", total: 125_000, fx: "99", fxBase: "USD" });
    await makeInvoice(u.id, { status: "sent", currency: "IDR", total: 1_500_000, fx: "0.0000666667", fxBase: "USD" });

    const { unpaid } = await getDashboardSummary(u.id, TODAY);
    // 1.500.000 IDR * 0.0000666667 = USD 100.00
    expect(unpaid).toMatchObject({ baseCurrency: "USD", totalBaseMinor: 125_000 + 10_000, converted: true });
  });

  it("does not inflate totals after the base currency changed: a rate stamped for another base is ignored", async () => {
    // 1 USD = 15,000 IDR was stored while the base was IDR.
    await saveRates("2026-10-20", { EUR: "1", USD: "1.08", IDR: "17000" });
    const u = await setupUser("IDR");
    await makeInvoice(u.id, { status: "sent", currency: "USD", total: 10_000, fx: "15000", fxBase: "IDR" });
    await makeInvoice(u.id, { status: "sent", currency: "IDR", total: 1_000_000, fx: "1", fxBase: "IDR" });
    expect((await getDashboardSummary(u.id, TODAY)).unpaid.totalBaseMinor).toBe(1_500_000 + 1_000_000);

    // The profile switches to USD: the stored 15,000 must not be read as "USD per USD".
    await testDb.update(businessProfiles).set({ baseCurrency: "USD" }).where(eq(businessProfiles.userId, u.id));
    const { unpaid } = await getDashboardSummary(u.id, TODAY);
    // USD 100.00 stays 10,000 minor; IDR 1.000.000 -> 1,000,000 * 1.08 / 17000 = USD 63.53.
    expect(unpaid).toMatchObject({ baseCurrency: "USD", totalBaseMinor: 10_000 + 6_353, converted: true, withoutRate: [] });
    expect(unpaid.rateDate).toBe("2026-10-20");
  });

  it("converts a stale-base or unstamped invoice with the rates on or before its issue date, else the latest", async () => {
    await saveRates("2026-10-10", { EUR: "1", USD: "1.00", IDR: "16000" });
    await saveRates("2026-10-20", { EUR: "1", USD: "1.08", IDR: "17000" });
    const u = await setupUser("IDR");
    // Issued 12 Oct: the 10 Oct table applies (16000 IDR per USD), although a rate for another base is stored.
    await makeInvoice(u.id, { status: "sent", currency: "USD", total: 100, fx: "3", fxBase: "EUR", issueDate: "2026-10-12" });
    // Issued before the first known table: the latest table stands in (17000 / 1.08).
    await makeInvoice(u.id, { status: "sent", currency: "USD", total: 100, issueDate: "2026-09-01" });
    const { unpaid } = await getDashboardSummary(u.id, TODAY);
    expect(unpaid.totalBaseMinor).toBe(16_000 + 15_741);
    expect(unpaid.rateDate).toBe("2026-10-20");
  });

  it("puts an invoice stamped for another base in withoutRate when no rate table is known", async () => {
    const u = await setupUser("USD");
    await makeInvoice(u.id, { status: "sent", currency: "IDR", total: 1_500_000, fx: "0.0000666667", fxBase: "EUR" });
    const { unpaid } = await getDashboardSummary(u.id, TODAY);
    expect(unpaid.totalBaseMinor).toBe(0);
    expect(unpaid.withoutRate).toEqual([{ currency: "IDR", totalMinor: 1_500_000, count: 1 }]);
  });

  it("uses the profile's base currency", async () => {
    const u = await setupUser("USD");
    await seed(u.id);
    const { unpaid } = await getDashboardSummary(u.id, TODAY);
    expect(unpaid.baseCurrency).toBe("USD");
    expect(unpaid.totalBaseMinor).toBe(125_000);
    expect(unpaid.withoutRate.map((t) => t.currency)).toEqual(["EUR", "IDR"]);
  });

  it("calls an invoice due today not overdue, and one due yesterday overdue", async () => {
    const u = await setupUser();
    await makeInvoice(u.id, { status: "sent", total: 100, due: TODAY });
    await makeInvoice(u.id, { status: "sent", total: 7, due: "2026-10-20" });
    const summary = await getDashboardSummary(u.id, TODAY);
    expect(summary.overdue).toMatchObject({ totalBaseMinor: 7, count: 1 });
    expect(summary.unpaid).toMatchObject({ totalBaseMinor: 107, count: 2 });
  });

  it("is empty for a user without invoices", async () => {
    const u = await setupUser();
    const empty = { baseCurrency: "IDR", totalBaseMinor: 0, converted: false, rateDate: null, withoutRate: [], count: 0 };
    expect(await getDashboardSummary(u.id, TODAY)).toEqual({
      unpaid: empty,
      overdue: empty,
      paidThisMonth: empty,
      pendingClaims: 0,
      recurringDrafts: 0,
    });
  });

  it("ignores another user's invoices and claims", async () => {
    const mine = await setupUser();
    const other = await setupUser();
    await seed(other.id);
    await makeInvoice(mine.id, { status: "sent", total: 42 });

    const summary = await getDashboardSummary(mine.id, TODAY);
    expect(summary.unpaid).toMatchObject({ totalBaseMinor: 42, count: 1, withoutRate: [] });
    expect(summary.overdue).toMatchObject({ totalBaseMinor: 0, count: 0 });
    expect(summary.paidThisMonth).toMatchObject({ totalBaseMinor: 0, count: 0 });
    expect(summary.pendingClaims).toBe(0);
  });
});

describe("recurring drafts banner", () => {
  beforeEach(resetDb);

  const NOW = new Date();

  /** A draft (or other status) the recurring run generated `daysAgo` days before NOW. */
  async function generatedInvoice(
    userId: string,
    scheduleId: string | null,
    opts: { status?: "draft" | "sent"; daysAgo: number; issueDate: string },
  ) {
    const draft = await makeInvoice(userId, { status: opts.status ?? "draft", total: 100, issueDate: opts.issueDate });
    await testDb
      .update(invoices)
      .set({ recurringScheduleId: scheduleId, createdAt: new Date(NOW.getTime() - opts.daysAgo * 86_400_000) })
      .where(eq(invoices.id, draft.id));
  }

  async function scheduleFor(userId: string) {
    const [row] = await testDb
      .insert(recurringSchedules)
      .values({ userId, frequency: "monthly", anchorDay: 1, nextRunOn: "2026-11-01" })
      .returning();
    return row.id;
  }

  it("counts recurring drafts created in the last 7 days that are still drafts", async () => {
    const u = await setupUser();
    const schedule = await scheduleFor(u.id);
    await generatedInvoice(u.id, schedule, { daysAgo: 0, issueDate: "2026-10-21" });
    await generatedInvoice(u.id, schedule, { daysAgo: 6, issueDate: "2026-10-15" });
    // Too old, already sent, and not generated by a schedule at all.
    await generatedInvoice(u.id, schedule, { daysAgo: 8, issueDate: "2026-10-13" });
    await generatedInvoice(u.id, schedule, { status: "sent", daysAgo: 1, issueDate: "2026-10-20" });
    await generatedInvoice(u.id, null, { daysAgo: 1, issueDate: "2026-10-20" });

    expect(await countRecurringDrafts(u.id, NOW)).toBe(2);
  });

  it("ignores other users' drafts and is part of the dashboard summary", async () => {
    const mine = await setupUser();
    const other = await setupUser();
    await generatedInvoice(other.id, await scheduleFor(other.id), { daysAgo: 1, issueDate: "2026-10-20" });
    expect(await countRecurringDrafts(mine.id, NOW)).toBe(0);

    await generatedInvoice(mine.id, await scheduleFor(mine.id), { daysAgo: 0, issueDate: "2026-10-21" });
    expect((await getDashboardSummary(mine.id, TODAY)).recurringDrafts).toBe(1);
    expect((await getDashboardSummary(other.id, TODAY)).recurringDrafts).toBe(1);
  });
});

describe("invoice tabs", () => {
  beforeEach(resetDb);

  it("counts invoices per tab", async () => {
    const u = await setupUser();
    await seed(u.id);
    expect(await countInvoicesByTab(u.id)).toEqual({ all: 10, draft: 1, unpaid: 4, paid: 4, void: 1 });
  });

  it("counts zero everywhere for a user without invoices and never counts others'", async () => {
    const u = await setupUser();
    const other = await setupUser();
    await seed(other.id);
    expect(await countInvoicesByTab(u.id)).toEqual({ all: 0, draft: 0, unpaid: 0, paid: 0, void: 0 });
  });

  it("filters the list by tab (unpaid = sent + payment_claimed)", async () => {
    const u = await setupUser();
    const other = await setupUser();
    await seed(u.id);
    await seed(other.id);

    const byTab = async (tab: "all" | "draft" | "unpaid" | "paid" | "void") =>
      (await listInvoices(u.id, { tab })).map((i) => i.status);

    expect(await byTab("all")).toHaveLength(10);
    expect((await byTab("unpaid")).sort()).toEqual(["payment_claimed", "sent", "sent", "sent"]);
    expect(await byTab("paid")).toEqual(["paid", "paid", "paid", "paid"]);
    expect(await byTab("draft")).toEqual(["draft"]);
    expect(await byTab("void")).toEqual(["void"]);
    expect(await listInvoices(u.id)).toHaveLength(10);
  });

  it("combines the tab with a search and a limit", async () => {
    const u = await setupUser();
    await seed(u.id);
    expect(await listInvoices(u.id, { limit: 3 })).toHaveLength(3);
    const [first] = await listInvoices(u.id, { tab: "paid" });
    expect(await listInvoices(u.id, { tab: "paid", search: first.number })).toHaveLength(1);
    expect(await listInvoices(u.id, { tab: "draft", search: first.number })).toHaveLength(0);
  });
});

describe("checklist", () => {
  beforeEach(resetDb);

  it("tracks whether a first invoice was ever sent", async () => {
    const u = await setupUser();
    expect(await hasSentInvoice(u.id)).toBe(false);
    await makeInvoice(u.id, { status: "draft", total: 1 });
    expect(await hasSentInvoice(u.id)).toBe(false);
    expect((await getChecklist(u.id)).hasSentInvoice).toBe(false);

    await makeInvoice(u.id, { status: "sent", total: 1 });
    expect(await hasSentInvoice(u.id)).toBe(true);
    expect((await getChecklist(u.id)).hasSentInvoice).toBe(true);
  });

  it("does not count another user's sent invoice", async () => {
    const u = await setupUser();
    const other = await setupUser();
    await makeInvoice(other.id, { status: "sent", total: 1 });
    expect(await hasSentInvoice(u.id)).toBe(false);
  });
});
