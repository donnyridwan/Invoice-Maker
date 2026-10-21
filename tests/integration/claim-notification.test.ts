import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { businessProfiles, paymentClaims } from "@/db/schema";
import { createClient } from "@/features/clients/queries";
import { markSent } from "@/features/invoices/lifecycle";
import { createDraftInvoice, getInvoice, saveInvoiceDraft } from "@/features/invoices/queries";
import { CLAIM_NOTIFY_TIMEOUT_MS, notifyOwnerOfClaim } from "@/features/invoices/notify-claim";
import { createPaymentClaim } from "@/features/payment-claims/queries";
import { ensureProfile } from "@/features/profile/queries";
import type { EmailTransport, OutgoingEmail } from "@/lib/email";
import { addDays, todayInJakarta } from "@/lib/dates";
import { createTestUser, resetDb, testDb } from "./helpers";

// createPaymentClaim notifies the owner through whatever transport `getEmailTransport()` returns.
const state: { transport: EmailTransport } = vi.hoisted(() => ({
  transport: { kind: "disabled", send: async () => ({ id: "unused" }) },
}));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  getEmailTransport: () => state.transport,
}));

function recording(kind: EmailTransport["kind"] = "file", failWith?: Error) {
  const sent: OutgoingEmail[] = [];
  state.transport = {
    kind,
    async send(email) {
      if (failWith) throw failWith;
      sent.push(email);
      return { id: "1" };
    },
  };
  return sent;
}

async function sentInvoiceOf(opts: { verified: boolean }) {
  const u = await createTestUser({ emailVerified: opts.verified });
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
  return { owner: u, invoice: await getInvoice(u.id, draft.id) };
}

const claimInput = () => ({ payerName: "Budi", paidOn: todayInJakarta(), amountMinor: 1_000_000, note: "Transfer BCA" });

describe("owner notification for a payment claim", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("emails a verified owner a link to the invoice", async () => {
    const sent = recording();
    const { owner, invoice } = await sentInvoiceOf({ verified: true });

    await createPaymentClaim(invoice.publicToken, claimInput(), null);

    expect(sent).toHaveLength(1);
    const [email] = sent;
    expect(email.to).toEqual([owner.email]);
    expect(email.subject).toBe(`Klien mengonfirmasi pembayaran invoice ${invoice.number}`);
    expect(email.html).toContain(`/invoices/${invoice.id}`);
    expect(email.html).toContain("Budi");
    expect(email.text).toContain(`/invoices/${invoice.id}`);
    expect(email.text).toContain("Transfer BCA");
  });

  it("sends nothing to an owner whose email is not verified", async () => {
    const sent = recording();
    const { invoice } = await sentInvoiceOf({ verified: false });

    await createPaymentClaim(invoice.publicToken, claimInput(), null);

    expect(sent).toHaveLength(0);
  });

  it("sends nothing when email delivery is disabled", async () => {
    const sent = recording("disabled");
    const { invoice } = await sentInvoiceOf({ verified: true });

    await createPaymentClaim(invoice.publicToken, claimInput(), null);

    expect(sent).toHaveLength(0);
  });

  it("still records the claim when the transport throws", async () => {
    recording("resend", new Error("Resend is down"));
    const { owner, invoice } = await sentInvoiceOf({ verified: true });

    const claim = await createPaymentClaim(invoice.publicToken, claimInput(), null);

    expect(claim.status).toBe("pending");
    expect((await getInvoice(owner.id, invoice.id)).status).toBe("payment_claimed");
  });

  it("does not wait for a transport that never answers: gives up after the timeout, best effort", async () => {
    expect(CLAIM_NOTIFY_TIMEOUT_MS).toBe(5000);
    const { invoice } = await sentInvoiceOf({ verified: true });
    const [claimRow] = await testDb.insert(paymentClaims).values({
      invoiceId: invoice.id,
      payerName: "Budi",
      paidOn: todayInJakarta(),
      amountMinor: 1_000_000,
    }).returning();
    const hanging: EmailTransport = { kind: "resend", send: () => new Promise(() => {}) };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const started = Date.now();
    await notifyOwnerOfClaim(claimRow.id, { transport: hanging, timeoutMs: 100 });
    error.mockRestore();

    expect(Date.now() - started).toBeLessThan(2000);
  });
});
