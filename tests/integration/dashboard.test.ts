import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { businessProfiles, invoices, paymentClaims } from "@/db/schema";
import { getDashboardSummary } from "@/features/dashboard/queries";
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
  sentAt?: boolean;
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
      dueDate: spec.due ?? "2026-11-01",
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

  it("totals unpaid, overdue and paid-this-month per currency, base currency first", async () => {
    const u = await setupUser("IDR");
    await seed(u.id);

    const summary = await getDashboardSummary(u.id, TODAY);

    expect(summary.unpaid).toEqual([
      { currency: "IDR", totalMinor: 1_500_000, count: 2 },
      { currency: "EUR", totalMinor: 10_000, count: 1 },
      { currency: "USD", totalMinor: 125_000, count: 1 },
    ]);
    expect(summary.overdue).toEqual([{ currency: "IDR", totalMinor: 500_000, count: 1 }]);
    // Calendar month in Jakarta: 05 Oct and the first instant of October count; September ones do not.
    expect(summary.paidThisMonth).toEqual([{ currency: "IDR", totalMinor: 2_070_000, count: 2 }]);
    expect(summary.pendingClaims).toBe(1);
  });

  it("puts the profile's base currency first", async () => {
    const u = await setupUser("USD");
    await seed(u.id);
    const summary = await getDashboardSummary(u.id, TODAY);
    expect(summary.unpaid.map((t) => t.currency)).toEqual(["USD", "EUR", "IDR"]);
  });

  it("calls an invoice due today not overdue, and one due yesterday overdue", async () => {
    const u = await setupUser();
    await makeInvoice(u.id, { status: "sent", total: 100, due: TODAY });
    await makeInvoice(u.id, { status: "sent", total: 7, due: "2026-10-20" });
    const summary = await getDashboardSummary(u.id, TODAY);
    expect(summary.overdue).toEqual([{ currency: "IDR", totalMinor: 7, count: 1 }]);
    expect(summary.unpaid).toEqual([{ currency: "IDR", totalMinor: 107, count: 2 }]);
  });

  it("is empty for a user without invoices", async () => {
    const u = await setupUser();
    expect(await getDashboardSummary(u.id, TODAY)).toEqual({
      unpaid: [],
      overdue: [],
      paidThisMonth: [],
      pendingClaims: 0,
    });
  });

  it("ignores another user's invoices and claims", async () => {
    const mine = await setupUser();
    const other = await setupUser();
    await seed(other.id);
    await makeInvoice(mine.id, { status: "sent", total: 42 });

    const summary = await getDashboardSummary(mine.id, TODAY);
    expect(summary.unpaid).toEqual([{ currency: "IDR", totalMinor: 42, count: 1 }]);
    expect(summary.overdue).toEqual([]);
    expect(summary.paidThisMonth).toEqual([]);
    expect(summary.pendingClaims).toBe(0);
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
