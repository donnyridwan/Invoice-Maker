import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionRateLimits, businessProfiles, paymentClaims } from "@/db/schema";
import { createClient } from "@/features/clients/queries";
import { markSent } from "@/features/invoices/lifecycle";
import { createDraftInvoice, getInvoice, saveInvoiceDraft } from "@/features/invoices/queries";
import { submitPaymentClaimAction } from "@/features/payment-claims/actions";
import { ensureProfile } from "@/features/profile/queries";
import { addDays, todayInJakarta } from "@/lib/dates";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createTestUser, resetDb, testDb } from "./helpers";

// The action reads the client's IP from the request headers and revalidates paths; neither exists outside a request.
const request = vi.hoisted(() => ({ headers: {} as Record<string, string> }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(request.headers) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

async function sentInvoice() {
  const u = await createTestUser({ emailVerified: false });
  await ensureProfile(u.id, { businessName: "Studio Donny", email: "donny@example.test" });
  await testDb.update(businessProfiles).set({ invoicePrefix: "INV-" }).where(eq(businessProfiles.userId, u.id));
  const draft = await createDraftInvoice(u.id);
  const client = await createClient(u.id, { name: "PT Maju Jaya", defaultCurrency: "IDR" });
  const today = todayInJakarta();
  await saveInvoiceDraft(u.id, draft.id, {
    clientId: client.id,
    number: draft.number,
    issueDate: today,
    dueDate: addDays(today, 14),
    currency: "IDR",
    language: "id",
    template: "minimal",
    accentColor: "#5850EC",
    discountType: "none",
    discountValue: 0,
    notes: "",
    paymentAccountIds: [],
    items: [{ name: "Desain", description: "", quantityMilli: 1000, unitPriceMinor: 1_000_000, unit: "" }],
  });
  await markSent(u.id, draft.id, "manual");
  return getInvoice(u.id, draft.id);
}

function claimForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  const fields = { payerName: "Budi", paidOn: todayInJakarta(), amount: "1000000", note: "", ...overrides };
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

beforeEach(async () => {
  await resetDb();
  request.headers = { "x-forwarded-for": "203.0.113.7" };
});

describe("consumeRateLimit", () => {
  const rule = { windowSeconds: 3600, max: 3 };

  it("allows `max` hits per window, then refuses", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push((await consumeRateLimit("k1", rule)).allowed);
    expect(results).toEqual([true, true, true, false, false]);
  });

  it("keeps keys apart and starts a new window after the old one ran out", async () => {
    const t0 = new Date("2026-10-21T00:00:00Z");
    for (let i = 0; i < 3; i++) await consumeRateLimit("k1", rule, t0);
    expect((await consumeRateLimit("k1", rule, t0)).allowed).toBe(false);
    expect((await consumeRateLimit("k2", rule, t0)).allowed).toBe(true);
    expect((await consumeRateLimit("k1", rule, new Date(t0.getTime() + 3599_000))).allowed).toBe(false);
    expect((await consumeRateLimit("k1", rule, new Date(t0.getTime() + 3600_000))).allowed).toBe(true);
  });

  it("counts concurrent hits exactly", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => consumeRateLimit("k3", rule)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });

  it("prunes windows that ended long ago", async () => {
    const old = new Date("2026-10-01T00:00:00Z");
    await consumeRateLimit("stale", rule, old);
    await consumeRateLimit("fresh", rule, new Date("2026-10-21T00:00:00Z"));
    const keys = (await testDb.select().from(actionRateLimits)).map((r) => r.key);
    expect(keys).toEqual(["fresh"]);
  });
});

describe("public claim action rate limit", () => {
  it("refuses the 11th submission within an hour from the same IP with a translatable error", async () => {
    const invoice = await sentInvoice();
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await submitPaymentClaimAction(invoice.publicToken, claimForm()));

    // Three claims fit (pending limit), the rest of the first ten are refused for that reason; the 11th is throttled.
    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true);
    for (const r of results.slice(3, 10)) expect(r).toMatchObject({ ok: false, fieldErrors: { _form: ["tooManyClaims"] } });
    expect(results[10]).toEqual({ ok: false, error: "validation", fieldErrors: { _form: ["tooManyAttempts"] } });
    expect(await testDb.select().from(paymentClaims)).toHaveLength(3);
  });

  it("limits per invoice and IP: another IP or another invoice is not affected", async () => {
    const one = await sentInvoice();
    const two = await sentInvoice();
    for (let i = 0; i < 10; i++) await submitPaymentClaimAction(one.publicToken, claimForm({ amount: "x" }));
    expect(await submitPaymentClaimAction(one.publicToken, claimForm())).toMatchObject({ fieldErrors: { _form: ["tooManyAttempts"] } });

    request.headers = { "x-forwarded-for": "198.51.100.9" };
    expect(await submitPaymentClaimAction(one.publicToken, claimForm())).toMatchObject({ ok: true });

    request.headers = { "x-forwarded-for": "203.0.113.7" };
    expect(await submitPaymentClaimAction(two.publicToken, claimForm())).toMatchObject({ ok: true });
  });

  it("does not record anything for a token that does not exist", async () => {
    expect(await submitPaymentClaimAction("0".repeat(32), claimForm())).toEqual({ ok: false, error: "notFound" });
    expect(await testDb.select().from(actionRateLimits)).toHaveLength(0);
  });
});
