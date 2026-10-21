import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { businessProfiles, exchangeRates, invoices } from "@/db/schema";
import { GET as cronFx } from "@/app/api/cron/fx/route";
import { fetchLatestRates } from "@/features/fx/fetch-rates";
import { fxForInvoice, getRateTableOnOrBefore, saveRates } from "@/features/fx/queries";
import { createDraftInvoice, duplicateInvoice, getInvoice, saveInvoiceDraft } from "@/features/invoices/queries";
import { ensureProfile } from "@/features/profile/queries";
import { addDays, todayInJakarta } from "@/lib/dates";
import { createTestUser, resetDb, testDb } from "./helpers";

const frankfurter = (body: unknown, status = 200): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;

const OK_BODY = { amount: 1, base: "EUR", date: "2026-10-20", rates: { USD: 1.08, IDR: 17000, XYZ: 3 } };

async function setupUser(baseCurrency = "IDR") {
  const u = await createTestUser();
  await ensureProfile(u.id, { businessName: "Studio Donny", email: "donny@example.test" });
  await testDb.update(businessProfiles).set({ invoicePrefix: "INV-", baseCurrency }).where(eq(businessProfiles.userId, u.id));
  return u;
}

function draftInput(overrides: Record<string, unknown> = {}) {
  const today = todayInJakarta();
  return {
    clientId: null,
    number: "INV-FX-1",
    issueDate: today,
    dueDate: addDays(today, 14),
    currency: "USD",
    language: "id",
    template: "minimal",
    accentColor: "#5850EC",
    discountType: "none",
    discountValue: 0,
    notes: "",
    paymentAccountIds: [],
    items: [],
    ...overrides,
  };
}

describe("fetchLatestRates", () => {
  it("returns the date and a EUR-based table of the supported currencies only", async () => {
    const out = await fetchLatestRates(frankfurter(OK_BODY));
    expect(out.date).toBe("2026-10-20");
    expect(out.rates).toEqual({ EUR: "1", USD: "1.08", IDR: "17000" });
  });

  it("asks Frankfurter for the latest rates", async () => {
    let requested = "";
    await fetchLatestRates((async (input: RequestInfo | URL) => {
      requested = String(input);
      return new Response(JSON.stringify(OK_BODY));
    }) as typeof fetch);
    expect(requested).toBe("https://api.frankfurter.app/latest");
  });

  it("throws on a non-200 response, invalid JSON or an unusable body", async () => {
    await expect(fetchLatestRates(frankfurter({}, 500))).rejects.toThrow();
    await expect(fetchLatestRates((async () => new Response("<html>", { status: 200 })) as typeof fetch)).rejects.toThrow();
    await expect(fetchLatestRates(frankfurter({ date: "nope", rates: { USD: 1 } }))).rejects.toThrow();
    await expect(fetchLatestRates(frankfurter({ date: "2026-10-20" }))).rejects.toThrow();
    await expect(fetchLatestRates(frankfurter({ date: "2026-10-20", rates: { XYZ: 2 } }))).rejects.toThrow();
    await expect(fetchLatestRates((async () => { throw new Error("offline"); }) as typeof fetch)).rejects.toThrow("offline");
  });
});

describe("exchange rate storage", () => {
  beforeEach(resetDb);

  it("saves a fetched table and reads the latest one on or before a date", async () => {
    const { date, rates } = await fetchLatestRates(frankfurter(OK_BODY));
    expect(await saveRates(date, rates)).toBe(3);

    const table = await getRateTableOnOrBefore("2026-10-21");
    expect(table?.date).toBe("2026-10-20");
    expect(table?.rates.USD).toBe("1.08");
    expect(Number(table?.rates.IDR)).toBe(17000);
  });

  it("upserts: saving the same date again replaces the rates", async () => {
    await saveRates("2026-10-20", { EUR: "1", USD: "1.08" });
    await saveRates("2026-10-20", { EUR: "1", USD: "1.10" });
    expect(await testDb.select().from(exchangeRates)).toHaveLength(2);
    expect(Number((await getRateTableOnOrBefore("2026-10-20"))?.rates.USD)).toBe(1.1);
  });

  it("picks the closest earlier date, else the newest available, else null", async () => {
    expect(await getRateTableOnOrBefore("2026-10-21")).toBeNull();
    await saveRates("2026-10-10", { EUR: "1", USD: "1.05" });
    await saveRates("2026-10-20", { EUR: "1", USD: "1.08" });
    expect((await getRateTableOnOrBefore("2026-10-15"))?.date).toBe("2026-10-10");
    expect((await getRateTableOnOrBefore("2026-10-20"))?.date).toBe("2026-10-20");
    expect((await getRateTableOnOrBefore("2026-12-31"))?.date).toBe("2026-10-20");
    // Nothing on or before 2026-01-01: the newest available one is used.
    expect((await getRateTableOnOrBefore("2026-01-01"))?.date).toBe("2026-10-20");
  });

  it("a failed fetch changes nothing", async () => {
    await saveRates("2026-10-10", { EUR: "1", USD: "1.05" });
    await expect(fetchLatestRates(frankfurter({}, 500)).then((r) => saveRates(r.date, r.rates))).rejects.toThrow();
    expect(await testDb.select().from(exchangeRates)).toHaveLength(2);
  });

  it("fxForInvoice crosses the currencies, returns 1 for the base and null without data", async () => {
    expect(await fxForInvoice("USD", "IDR", "2026-10-21")).toBeNull();
    expect(await fxForInvoice("IDR", "IDR", "2026-10-21")).toEqual({ rate: "1", date: "2026-10-21" });

    await saveRates("2026-10-20", { EUR: "1", USD: "1.08", IDR: "17000" });
    const fx = await fxForInvoice("USD", "IDR", "2026-10-21");
    expect(fx?.date).toBe("2026-10-20");
    expect(Number(fx?.rate)).toBeCloseTo(15740.7407407407, 6);
    // A currency missing from the table has no rate.
    expect(await fxForInvoice("THB", "IDR", "2026-10-21")).toBeNull();
  });
});

describe("fx rate on invoices", () => {
  beforeEach(resetDb);

  it("saving a USD invoice of an IDR-base profile stores the rate and its date", async () => {
    await saveRates("2026-10-20", { EUR: "1", USD: "1.08", IDR: "17000" });
    const u = await setupUser("IDR");
    const draft = await createDraftInvoice(u.id);
    await saveInvoiceDraft(u.id, draft.id, draftInput({ issueDate: "2026-10-21", dueDate: "2026-11-04" }));

    const saved = await getInvoice(u.id, draft.id);
    expect(Number(saved.fxRateToBase)).toBeCloseTo(15740.74, 2);
    expect(saved.fxRateDate).toBe("2026-10-20");
  });

  it("uses the rate of the issue date, not the newest one", async () => {
    await saveRates("2026-10-10", { EUR: "1", USD: "1.00", IDR: "16000" });
    await saveRates("2026-10-20", { EUR: "1", USD: "1.08", IDR: "17000" });
    const u = await setupUser("IDR");
    const draft = await createDraftInvoice(u.id);
    await saveInvoiceDraft(u.id, draft.id, draftInput({ issueDate: "2026-10-12", dueDate: "2026-10-26" }));
    const saved = await getInvoice(u.id, draft.id);
    expect(Number(saved.fxRateToBase)).toBe(16000);
    expect(saved.fxRateDate).toBe("2026-10-10");
  });

  it("is null in both columns without any rate data", async () => {
    const u = await setupUser("IDR");
    const draft = await createDraftInvoice(u.id);
    await saveInvoiceDraft(u.id, draft.id, draftInput());
    const saved = await getInvoice(u.id, draft.id);
    expect(saved.fxRateToBase).toBeNull();
    expect(saved.fxRateDate).toBeNull();
  });

  it("is 1 when the invoice is in the base currency, and follows a currency change", async () => {
    await saveRates("2026-10-20", { EUR: "1", USD: "1.08", IDR: "17000" });
    const u = await setupUser("IDR");
    const draft = await createDraftInvoice(u.id);
    expect(Number((await getInvoice(u.id, draft.id)).fxRateToBase)).toBe(1);

    await saveInvoiceDraft(u.id, draft.id, draftInput());
    expect(Number((await getInvoice(u.id, draft.id)).fxRateToBase)).toBeCloseTo(15740.74, 2);
    await saveInvoiceDraft(u.id, draft.id, draftInput({ currency: "IDR" }));
    expect(Number((await getInvoice(u.id, draft.id)).fxRateToBase)).toBe(1);
  });

  it("fills the rate on a new draft in a foreign default currency and on a duplicate", async () => {
    await saveRates("2026-10-20", { EUR: "1", USD: "1.08", IDR: "17000" });
    const u = await setupUser("IDR");
    await testDb.update(businessProfiles).set({ defaultCurrency: "USD" }).where(eq(businessProfiles.userId, u.id));
    const draft = await createDraftInvoice(u.id);
    expect(draft.currency).toBe("USD");
    expect(Number(draft.fxRateToBase)).toBeCloseTo(15740.74, 2);
    expect(draft.fxRateDate).toBe("2026-10-20");

    // The copy gets the rate of today, whatever the source stored.
    await testDb.update(invoices).set({ fxRateToBase: null, fxRateDate: null }).where(eq(invoices.id, draft.id));
    const copy = await duplicateInvoice(u.id, draft.id);
    expect(Number(copy.fxRateToBase)).toBeCloseTo(15740.74, 2);
    expect(copy.fxRateDate).toBe("2026-10-20");
  });
});

describe("GET /api/cron/fx", () => {
  beforeEach(async () => {
    await resetDb();
    vi.stubEnv("CRON_SECRET", "cron-test-secret");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const call = (authorization?: string) =>
    cronFx(new Request("http://localhost/api/cron/fx", authorization ? { headers: { authorization } } : {}));

  it("answers 401 without the secret and does nothing", async () => {
    const fetchSpy = vi.fn(frankfurter(OK_BODY));
    vi.stubGlobal("fetch", fetchSpy);
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await testDb.select().from(exchangeRates)).toHaveLength(0);
  });

  it("fetches and stores the rates, answering { date, saved }", async () => {
    vi.stubGlobal("fetch", vi.fn(frankfurter(OK_BODY)));
    const response = await call("Bearer cron-test-secret");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ date: "2026-10-20", saved: 3 });
    expect((await getRateTableOnOrBefore("2026-10-21"))?.date).toBe("2026-10-20");
  });

  it("answers an error and stores nothing when the source fails", async () => {
    vi.stubGlobal("fetch", vi.fn(frankfurter({}, 500)));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call("Bearer cron-test-secret")).status).toBe(502);
    expect(await testDb.select().from(exchangeRates)).toHaveLength(0);
  });
});
