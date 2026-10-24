import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { businessProfiles, invoiceEvents } from "@/db/schema";
import { createClient } from "@/features/clients/queries";
import { sendInvoiceEmail } from "@/features/invoices/send-email";
import { createDraftInvoice, getInvoice, saveInvoiceDraft } from "@/features/invoices/queries";
import { markSent, voidInvoice } from "@/features/invoices/lifecycle";
import { ensureProfile } from "@/features/profile/queries";
import type { EmailTransport, OutgoingEmail } from "@/lib/email";
import { addDays, todayInJakarta } from "@/lib/dates";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createTestUser, resetDb, testDb } from "./helpers";

const PDF_BYTES = new TextEncoder().encode("%PDF-1.4 fake");

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

const renderPdf = async () => PDF_BYTES;

async function setupOwner(opts: { verified?: boolean } = {}) {
  const u = await createTestUser({ emailVerified: opts.verified ?? true, name: "Donny" });
  await ensureProfile(u.id, { businessName: "Studio Donny", email: "donny@example.test" });
  await testDb.update(businessProfiles).set({ invoicePrefix: "INV-" }).where(eq(businessProfiles.userId, u.id));
  return { id: u.id, email: u.email, emailVerified: opts.verified ?? true };
}

/** A sendable draft of 1.500.000 IDR for a client with an email address. */
async function draftInvoice(userId: string, opts: { withClient?: boolean } = {}) {
  const draft = await createDraftInvoice(userId);
  const client =
    opts.withClient === false
      ? null
      : await createClient(userId, { name: "PT Maju Jaya", email: "billing@majujaya.test", defaultCurrency: "IDR" });
  const today = todayInJakarta();
  await saveInvoiceDraft(userId, draft.id, {
    clientId: client?.id ?? null,
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
    items: [{ name: "Desain", description: "", quantityMilli: 1000, unitPriceMinor: 1_500_000, unit: "" }],
  });
  return getInvoice(userId, draft.id);
}

const validInput = (overrides: Record<string, unknown> = {}) => ({
  to: "billing@majujaya.test",
  cc: [],
  subject: "Invoice INV-0001 dari Studio Donny",
  message: "Halo,\n\nBerikut invoicenya.",
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

const eventsOf = (invoiceId: string) => testDb.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, invoiceId));

describe("sendInvoiceEmail", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("refuses an owner whose email is not verified, without touching the transport", async () => {
    const owner = await setupOwner({ verified: false });
    const inv = await draftInvoice(owner.id);
    const { transport, sent } = recordingTransport();

    const errors = await fieldErrors(sendInvoiceEmail(owner, inv.id, validInput(), { transport, renderPdf }));

    expect(errors).toEqual({ _form: ["emailNotVerified"] });
    expect(sent).toHaveLength(0);
    expect((await getInvoice(owner.id, inv.id)).status).toBe("draft");
  });

  it("refuses when email delivery is disabled", async () => {
    const owner = await setupOwner();
    const inv = await draftInvoice(owner.id);
    const { transport, sent } = recordingTransport("disabled");

    const errors = await fieldErrors(sendInvoiceEmail(owner, inv.id, validInput(), { transport, renderPdf }));

    expect(errors).toEqual({ _form: ["emailDisabled"] });
    expect(sent).toHaveLength(0);
  });

  it("reports an empty recipient on `to` and an invalid CC address on `cc`, sending nothing", async () => {
    const owner = await setupOwner();
    const inv = await draftInvoice(owner.id);
    const { transport, sent } = recordingTransport();

    const noTo = await fieldErrors(sendInvoiceEmail(owner, inv.id, validInput({ to: "" }), { transport, renderPdf }));
    expect(noTo?.to).toBeDefined();
    const badCc = await fieldErrors(
      sendInvoiceEmail(owner, inv.id, validInput({ cc: ["bukan"] }), { transport, renderPdf }),
    );
    expect(badCc?.cc).toEqual(["invalidEmail"]);
    const tooMany = await fieldErrors(
      sendInvoiceEmail(owner, inv.id, validInput({ cc: Array.from({ length: 6 }, (_, i) => `c${i}@x.test`) }), {
        transport,
        renderPdf,
      }),
    );
    expect(tooMany?.cc).toEqual(["tooManyRecipients:5"]);
    const badSubject = await fieldErrors(
      sendInvoiceEmail(owner, inv.id, validInput({ subject: "x".repeat(201), message: "y".repeat(5001) }), {
        transport,
        renderPdf,
      }),
    );
    expect(badSubject).toEqual({ subject: ["tooLong:200"], message: ["tooLong:5000"] });

    expect(sent).toHaveLength(0);
    expect((await getInvoice(owner.id, inv.id)).status).toBe("draft");
  });

  it("sends the email with the PDF, marks the draft sent and logs sent_email", async () => {
    const owner = await setupOwner();
    const inv = await draftInvoice(owner.id);
    const { transport, sent } = recordingTransport();

    await sendInvoiceEmail(owner, inv.id, validInput({ cc: ["akuntan@majujaya.test"] }), { transport, renderPdf });

    expect(sent).toHaveLength(1);
    const [email] = sent;
    expect(email.from).toContain("Studio Donny");
    expect(email.replyTo).toBe(owner.email);
    expect(email.to).toEqual(["billing@majujaya.test"]);
    expect(email.cc).toEqual(["akuntan@majujaya.test"]);
    expect(email.subject).toBe("Invoice INV-0001 dari Studio Donny");
    expect(email.attachments).toHaveLength(1);
    expect(email.attachments![0].filename).toBe(`${inv.number}.pdf`);
    expect(email.attachments![0].content).toEqual(PDF_BYTES);
    expect(email.html).toContain(`/i/${inv.publicToken}`);
    expect(email.html).toContain("Lihat invoice");
    expect(email.html).toContain("Studio Donny");
    expect(email.html).toContain("1.500.000");
    expect(email.text).toContain(`/i/${inv.publicToken}`);
    expect(email.text).toContain("Berikut invoicenya.");

    const after = await getInvoice(owner.id, inv.id);
    expect(after.status).toBe("sent");
    expect(after.sentAt).not.toBeNull();
    const events = await eventsOf(inv.id);
    const sentEvent = events.find((e) => e.type === "sent_email");
    expect(sentEvent?.meta).toEqual({ to: "billing@majujaya.test", cc: ["akuntan@majujaya.test"] });
    expect(events.find((e) => e.type === "sent")?.meta).toEqual({ channel: "email" });
  });

  it("emails an already sent invoice again with exactly one new sent_email event", async () => {
    const owner = await setupOwner();
    const inv = await draftInvoice(owner.id);
    await markSent(owner.id, inv.id, "manual");
    const { transport, sent } = recordingTransport();

    await sendInvoiceEmail(owner, inv.id, validInput(), { transport, renderPdf });

    expect(sent).toHaveLength(1);
    expect((await getInvoice(owner.id, inv.id)).status).toBe("sent");
    expect((await eventsOf(inv.id)).filter((e) => e.type === "sent_email")).toHaveLength(1);
  });

  it("applies the sendable rules and refuses void invoices before sending anything", async () => {
    const owner = await setupOwner();
    const noClient = await draftInvoice(owner.id, { withClient: false });
    const { transport, sent } = recordingTransport();
    expect(await fieldErrors(sendInvoiceEmail(owner, noClient.id, validInput(), { transport, renderPdf }))).toEqual({
      _form: ["clientRequired"],
    });

    const voided = await draftInvoice(owner.id);
    await voidInvoice(owner.id, voided.id);
    expect(await fieldErrors(sendInvoiceEmail(owner, voided.id, validInput(), { transport, renderPdf }))).toEqual({
      _form: ["invalidTransition"],
    });
    expect(sent).toHaveLength(0);
  });

  it("does not let one user email another user's invoice", async () => {
    const owner = await setupOwner();
    const other = await setupOwner();
    const inv = await draftInvoice(owner.id);
    const { transport, sent } = recordingTransport();

    await expect(sendInvoiceEmail(other, inv.id, validInput(), { transport, renderPdf })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(sent).toHaveLength(0);
  });

  describe("daily limit", () => {
    async function seedSentEvents(invoiceId: string, count: number, createdAt: Date) {
      await testDb
        .insert(invoiceEvents)
        .values(Array.from({ length: count }, () => ({ invoiceId, type: "sent_email" as const, meta: {}, createdAt })));
    }

    it("stops at 50 sent_email events within 24 hours", async () => {
      const owner = await setupOwner();
      const inv = await draftInvoice(owner.id);
      await seedSentEvents(inv.id, 50, new Date(Date.now() - 23 * 3600_000));
      const { transport, sent } = recordingTransport();

      const errors = await fieldErrors(sendInvoiceEmail(owner, inv.id, validInput(), { transport, renderPdf }));

      expect(errors).toEqual({ _form: ["rateLimited"] });
      expect(sent).toHaveLength(0);
      expect((await getInvoice(owner.id, inv.id)).status).toBe("draft");
    });

    it("counts across all of the user's invoices, but not older events or other users", async () => {
      const owner = await setupOwner();
      const other = await setupOwner();
      const a = await draftInvoice(owner.id);
      const b = await draftInvoice(owner.id);
      const foreign = await draftInvoice(other.id);
      await seedSentEvents(a.id, 49, new Date());
      await seedSentEvents(b.id, 30, new Date(Date.now() - 25 * 3600_000));
      await seedSentEvents(foreign.id, 60, new Date());
      const { transport, sent } = recordingTransport();

      await sendInvoiceEmail(owner, b.id, validInput(), { transport, renderPdf }); // the 50th
      expect(sent).toHaveLength(1);
      expect(await fieldErrors(sendInvoiceEmail(owner, b.id, validInput(), { transport, renderPdf }))).toEqual({
        _form: ["rateLimited"],
      });
    });
  });

  describe("delivery failures", () => {
    it("logs email_failed, keeps the invoice a draft and reports emailFailed when the transport throws", async () => {
      const owner = await setupOwner();
      const inv = await draftInvoice(owner.id);
      const { transport } = recordingTransport("resend", new Error("Resend is down"));

      const errors = await fieldErrors(sendInvoiceEmail(owner, inv.id, validInput(), { transport, renderPdf }));

      expect(errors).toEqual({ _form: ["emailFailed"] });
      expect((await getInvoice(owner.id, inv.id)).status).toBe("draft");
      const events = await eventsOf(inv.id);
      expect(events.find((e) => e.type === "email_failed")?.meta).toEqual({ error: "Resend is down" });
      expect(events.some((e) => e.type === "sent_email" || e.type === "sent")).toBe(false);
    });

    it("treats a PDF rendering failure the same way", async () => {
      const owner = await setupOwner();
      const inv = await draftInvoice(owner.id);
      const { transport, sent } = recordingTransport();

      const errors = await fieldErrors(
        sendInvoiceEmail(owner, inv.id, validInput(), {
          transport,
          renderPdf: async () => {
            throw new Error("Chromium crashed");
          },
        }),
      );

      expect(errors).toEqual({ _form: ["emailFailed"] });
      expect(sent).toHaveLength(0);
      expect((await eventsOf(inv.id)).find((e) => e.type === "email_failed")?.meta).toEqual({ error: "Chromium crashed" });
    });
  });
});
