import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { businessProfiles, invoiceEvents, invoices, paymentClaims } from "@/db/schema";
import { createClient } from "@/features/clients/queries";
import { markPaid, markSent, voidInvoice } from "@/features/invoices/lifecycle";
import { createDraftInvoice, getInvoice, saveInvoiceDraft } from "@/features/invoices/queries";
import {
  acceptClaim,
  countPendingClaims,
  createPaymentClaim,
  listClaims,
  rejectClaim,
} from "@/features/payment-claims/queries";
import { ensureProfile } from "@/features/profile/queries";
import { addDays, todayInJakarta } from "@/lib/dates";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createTestUser, resetDb, testDb } from "./helpers";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");
const PROOF_DIR = path.join(process.cwd(), "public", "uploads", "payment-proof");
const stored: string[] = [];

afterAll(async () => {
  await Promise.all(stored.map((url) => rm(path.join(process.cwd(), "public", url), { force: true })));
});

async function setupUser() {
  const u = await createTestUser();
  await ensureProfile(u.id, { businessName: "Studio Donny", email: "donny@example.test" });
  await testDb.update(businessProfiles).set({ invoicePrefix: "INV-" }).where(eq(businessProfiles.userId, u.id));
  return u;
}

/** A sent invoice of 1.000.000 (IDR) ready to receive claims. */
async function sentInvoice(userId: string) {
  const draft = await createDraftInvoice(userId);
  const client = await createClient(userId, { name: "PT Maju Jaya", defaultCurrency: "IDR" });
  const today = todayInJakarta();
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
    notes: "",
    paymentAccountIds: [],
    items: [{ name: "Desain", description: "", quantityMilli: 1000, unit: "", unitPriceMinor: 1_000_000 }],
  });
  await markSent(userId, draft.id, "manual");
  return getInvoice(userId, draft.id);
}

const claimInput = (overrides: Record<string, unknown> = {}) => ({
  payerName: "Budi",
  paidOn: todayInJakarta(),
  amountMinor: 1_000_000,
  note: "",
  ...overrides,
});

async function fieldErrors(promise: Promise<unknown>): Promise<Record<string, string[]> | undefined> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ValidationError) return e.fieldErrors;
    throw e;
  }
  return undefined;
}

async function eventsOf(invoiceId: string) {
  return testDb.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, invoiceId));
}

async function statusOf(userId: string, invoiceId: string) {
  return (await getInvoice(userId, invoiceId)).status;
}

describe("payment claims", () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe("createPaymentClaim", () => {
    it("records a pending claim and moves a sent invoice to payment_claimed", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);

      const claim = await createPaymentClaim(inv.publicToken, claimInput({ note: "Transfer BCA" }), null);

      expect(claim).toMatchObject({
        invoiceId: inv.id,
        payerName: "Budi",
        amountMinor: 1_000_000,
        note: "Transfer BCA",
        proofUrl: null,
        status: "pending",
        decidedAt: null,
      });
      expect(await statusOf(u.id, inv.id)).toBe("payment_claimed");
      const event = (await eventsOf(inv.id)).find((e) => e.type === "payment_claimed");
      expect(event?.meta).toEqual({ claimId: claim.id });
    });

    it("stores a PNG proof and keeps its url on the claim", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);

      const claim = await createPaymentClaim(inv.publicToken, claimInput(), { bytes: PNG, size: PNG.length });

      expect(claim.proofUrl).toMatch(/^\/uploads\/payment-proof\/[0-9a-f-]{36}\.png$/);
      stored.push(claim.proofUrl!);
      expect(existsSync(path.join(process.cwd(), "public", claim.proofUrl!))).toBe(true);
    });

    it("rejects a proof that is not an image/PDF and stores no claim", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);

      const errors = await fieldErrors(
        createPaymentClaim(inv.publicToken, claimInput(), { bytes: HTML, size: HTML.length }),
      );

      expect(errors).toEqual({ file: ["fileType"] });
      expect(await testDb.select().from(paymentClaims)).toHaveLength(0);
      expect(await statusOf(u.id, inv.id)).toBe("sent");
    });

    it("stores no proof file when the claim is refused (too many pending)", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);
      for (let i = 0; i < 3; i++) await createPaymentClaim(inv.publicToken, claimInput(), null);
      const files = async () => (existsSync(PROOF_DIR) ? readdir(PROOF_DIR) : []);
      const before = await files();

      const errors = await fieldErrors(
        createPaymentClaim(inv.publicToken, claimInput(), { bytes: PNG, size: PNG.length }),
      );

      expect(errors).toEqual({ _form: ["tooManyClaims"] });
      expect(await files()).toEqual(before);
    });

    it.each(["draft", "void", "paid"] as const)("refuses a claim on a %s invoice and leaves its status alone", async (status) => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);
      await testDb.update(invoices).set({ status }).where(eq(invoices.id, inv.id));

      await expect(createPaymentClaim(inv.publicToken, claimInput(), null)).rejects.toBeInstanceOf(NotFoundError);

      expect(await statusOf(u.id, inv.id)).toBe(status);
      expect(await testDb.select().from(paymentClaims)).toHaveLength(0);
    });

    it("refuses an unknown token", async () => {
      await expect(createPaymentClaim("does-not-exist", claimInput(), null)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("allows three pending claims and refuses the fourth with tooManyClaims", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);
      for (let i = 0; i < 3; i++) await createPaymentClaim(inv.publicToken, claimInput(), null);

      expect(await fieldErrors(createPaymentClaim(inv.publicToken, claimInput(), null))).toEqual({
        _form: ["tooManyClaims"],
      });
      expect(await listClaims(u.id, inv.id)).toHaveLength(3);
    });

    it("refuses a payment date more than one day ahead, accepts tomorrow", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);
      const today = todayInJakarta();

      expect(
        await fieldErrors(createPaymentClaim(inv.publicToken, claimInput({ paidOn: addDays(today, 3) }), null)),
      ).toEqual({ paidOn: ["paidOnFuture"] });
      expect(await listClaims(u.id, inv.id)).toHaveLength(0);

      await expect(
        createPaymentClaim(inv.publicToken, claimInput({ paidOn: addDays(today, 1) }), null),
      ).resolves.toMatchObject({ status: "pending" });
    });

    it("validates the other fields", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);

      const errors = await fieldErrors(
        createPaymentClaim(inv.publicToken, { payerName: " ", paidOn: "nope", amountMinor: 0, note: "x".repeat(2001) }, null),
      );

      expect(errors).toMatchObject({
        payerName: ["required"],
        paidOn: ["invalidDate"],
        amountMinor: ["invalidAmount"],
        note: ["tooLong:2000"],
      });
    });

    it("also accepts a further claim on an invoice that is already payment_claimed", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);
      await createPaymentClaim(inv.publicToken, claimInput(), null);
      await createPaymentClaim(inv.publicToken, claimInput({ payerName: "Siti" }), null);

      expect(await statusOf(u.id, inv.id)).toBe("payment_claimed");
      expect(await countPendingClaims(u.id)).toBe(2);
    });
  });

  describe("rejectClaim", () => {
    it("keeps payment_claimed while another claim is pending, returns to sent after the last", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);
      const first = await createPaymentClaim(inv.publicToken, claimInput(), null);
      const second = await createPaymentClaim(inv.publicToken, claimInput({ payerName: "Siti" }), null);

      await rejectClaim(u.id, first.id);
      expect(await statusOf(u.id, inv.id)).toBe("payment_claimed");

      await rejectClaim(u.id, second.id);
      expect(await statusOf(u.id, inv.id)).toBe("sent");

      const claims = await listClaims(u.id, inv.id);
      expect(claims.map((c) => c.status)).toEqual(["rejected", "rejected"]);
      expect(claims.every((c) => c.decidedAt instanceof Date)).toBe(true);
      const rejected = (await eventsOf(inv.id)).filter((e) => e.type === "claim_rejected");
      expect(rejected.map((e) => e.meta).sort((a, b) => String(a.claimId).localeCompare(String(b.claimId)))).toEqual(
        [{ claimId: first.id }, { claimId: second.id }].sort((a, b) => a.claimId.localeCompare(b.claimId)),
      );
    });

    it("cannot decide a claim twice", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);
      const claim = await createPaymentClaim(inv.publicToken, claimInput(), null);
      await rejectClaim(u.id, claim.id);

      expect(await fieldErrors(rejectClaim(u.id, claim.id))).toEqual({ _form: ["invalidTransition"] });
      expect(await fieldErrors(acceptClaim(u.id, claim.id))).toEqual({ _form: ["invalidTransition"] });
      expect(await statusOf(u.id, inv.id)).toBe("sent");
    });
  });

  describe("acceptClaim", () => {
    it("marks the invoice paid on the claimed date and rejects the other pending claims", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);
      const first = await createPaymentClaim(inv.publicToken, claimInput({ paidOn: "2026-10-20" }), null);
      const second = await createPaymentClaim(inv.publicToken, claimInput({ payerName: "Siti" }), null);

      await acceptClaim(u.id, first.id);

      const paid = await getInvoice(u.id, inv.id);
      expect(paid.status).toBe("paid");
      expect(paid.paidAt?.toISOString()).toBe("2026-10-19T17:00:00.000Z");
      const claims = await listClaims(u.id, inv.id);
      expect(claims.find((c) => c.id === first.id)?.status).toBe("accepted");
      expect(claims.find((c) => c.id === second.id)?.status).toBe("rejected");
      expect(claims.every((c) => c.decidedAt instanceof Date)).toBe(true);
      const event = (await eventsOf(inv.id)).find((e) => e.type === "marked_paid");
      expect(event?.meta).toMatchObject({ claimId: first.id });
      expect(await countPendingClaims(u.id)).toBe(0);
    });

    it("refuses to accept a claim on a voided invoice", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);
      const claim = await createPaymentClaim(inv.publicToken, claimInput(), null);
      await voidInvoice(u.id, inv.id);

      expect(await fieldErrors(acceptClaim(u.id, claim.id))).toEqual({ _form: ["invalidTransition"] });
      expect(await statusOf(u.id, inv.id)).toBe("void");
    });
  });

  describe("cross-user access", () => {
    it("acceptClaim, rejectClaim and listClaims on another user's invoice are NotFound", async () => {
      const owner = await setupUser();
      const other = await setupUser();
      const inv = await sentInvoice(owner.id);
      const claim = await createPaymentClaim(inv.publicToken, claimInput(), null);

      await expect(acceptClaim(other.id, claim.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(rejectClaim(other.id, claim.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(listClaims(other.id, inv.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(acceptClaim(other.id, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);

      expect(await statusOf(owner.id, inv.id)).toBe("payment_claimed");
      expect((await listClaims(owner.id, inv.id))[0].status).toBe("pending");
      expect(await countPendingClaims(other.id)).toBe(0);
      expect(await countPendingClaims(owner.id)).toBe(1);
    });
  });

  describe("listClaims", () => {
    it("lists newest first", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);
      const first = await createPaymentClaim(inv.publicToken, claimInput({ payerName: "Budi" }), null);
      const second = await createPaymentClaim(inv.publicToken, claimInput({ payerName: "Siti" }), null);

      expect((await listClaims(u.id, inv.id)).map((c) => c.id)).toEqual([second.id, first.id]);
    });
  });

  describe("manual markPaid with pending claims", () => {
    it("accepts a single pending claim", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);
      const claim = await createPaymentClaim(inv.publicToken, claimInput(), null);

      await markPaid(u.id, inv.id, { paidOn: todayInJakarta() });

      const [after] = await listClaims(u.id, inv.id);
      expect(after.id).toBe(claim.id);
      expect(after.status).toBe("accepted");
      expect(after.decidedAt).toBeInstanceOf(Date);
    });

    it("accepts the most recent of several pending claims and rejects the rest", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);
      const first = await createPaymentClaim(inv.publicToken, claimInput({ payerName: "A" }), null);
      const second = await createPaymentClaim(inv.publicToken, claimInput({ payerName: "B" }), null);
      const third = await createPaymentClaim(inv.publicToken, claimInput({ payerName: "C" }), null);

      await markPaid(u.id, inv.id, { paidOn: todayInJakarta() });

      const byId = new Map((await listClaims(u.id, inv.id)).map((c) => [c.id, c.status]));
      expect(byId.get(third.id)).toBe("accepted");
      expect(byId.get(second.id)).toBe("rejected");
      expect(byId.get(first.id)).toBe("rejected");
      expect(await countPendingClaims(u.id)).toBe(0);
    });

    it("leaves already decided claims alone and works without any claim", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);
      const claim = await createPaymentClaim(inv.publicToken, claimInput(), null);
      await rejectClaim(u.id, claim.id);

      await markPaid(u.id, inv.id, { paidOn: todayInJakarta() });

      expect((await listClaims(u.id, inv.id))[0].status).toBe("rejected");
      expect(await statusOf(u.id, inv.id)).toBe("paid");
    });
  });

  describe("voiding an invoice with pending claims", () => {
    it("rejects every pending claim in the same transaction and leaves decided ones alone", async () => {
      const u = await setupUser();
      const inv = await sentInvoice(u.id);
      const token = inv.publicToken;
      const first = await createPaymentClaim(token, claimInput({ payerName: "Budi" }), null);
      await rejectClaim(u.id, first.id);
      await createPaymentClaim(token, claimInput({ payerName: "Siti" }), null);
      await createPaymentClaim(token, claimInput({ payerName: "Joko" }), null);
      expect(await statusOf(u.id, inv.id)).toBe("payment_claimed");

      await voidInvoice(u.id, inv.id);

      expect(await statusOf(u.id, inv.id)).toBe("void");
      const claims = await listClaims(u.id, inv.id);
      expect(claims).toHaveLength(3);
      expect(claims.every((c) => c.status === "rejected")).toBe(true);
      expect(claims.filter((c) => c.decidedAt === null)).toHaveLength(0);
      expect(await countPendingClaims(u.id)).toBe(0);
      expect((await eventsOf(inv.id)).filter((e) => e.type === "voided")).toHaveLength(1);
    });

    it("does not touch the claims of another invoice", async () => {
      const u = await setupUser();
      const a = await sentInvoice(u.id);
      const b = await sentInvoice(u.id);
      await createPaymentClaim(a.publicToken, claimInput(), null);
      await createPaymentClaim(b.publicToken, claimInput(), null);

      await voidInvoice(u.id, a.id);

      expect((await listClaims(u.id, b.id)).map((c) => c.status)).toEqual(["pending"]);
      expect(await statusOf(u.id, b.id)).toBe("payment_claimed");
    });
  });
});
