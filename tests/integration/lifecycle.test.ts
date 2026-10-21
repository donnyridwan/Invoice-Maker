import { desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { businessProfiles, invoiceEvents, invoices } from "@/db/schema";
import { createClient } from "@/features/clients/queries";
import { listEvents } from "@/features/invoices/events";
import {
  assertSendable,
  markPaid,
  markSent,
  recordPublicView,
  unmarkPaid,
  voidInvoice,
} from "@/features/invoices/lifecycle";
import { createDraftInvoice, getInvoice, saveInvoiceDraft } from "@/features/invoices/queries";
import { ensureProfile } from "@/features/profile/queries";
import { addDays, todayInJakarta } from "@/lib/dates";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createTestUser, resetDb, testDb } from "./helpers";

async function setupUser() {
  const u = await createTestUser();
  await ensureProfile(u.id, { businessName: "Studio Donny", email: "donny@example.test" });
  await testDb.update(businessProfiles).set({ invoicePrefix: "INV-" }).where(eq(businessProfiles.userId, u.id));
  return u;
}

const item = (overrides: Record<string, unknown> = {}) => ({
  name: "Desain",
  description: "",
  quantityMilli: 1000,
  unit: "",
  unitPriceMinor: 1_000_000,
  ...overrides,
});

/** A draft that satisfies the send requirements (client, one item, total > 0), unless overridden. */
async function makeDraft(userId: string, opts: { client?: boolean; items?: unknown[] } = {}) {
  const draft = await createDraftInvoice(userId);
  const client = opts.client === false ? null : await createClient(userId, { name: "PT Maju Jaya", defaultCurrency: "IDR" });
  const today = todayInJakarta();
  await saveInvoiceDraft(userId, draft.id, {
    clientId: client?.id ?? null,
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
    items: opts.items ?? [item()],
  });
  return draft;
}

async function sentInvoice(userId: string) {
  const draft = await makeDraft(userId);
  await markSent(userId, draft.id, "manual");
  return draft;
}

async function formError(promise: Promise<unknown>): Promise<string[] | undefined> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ValidationError) return e.fieldErrors._form;
    throw e;
  }
  return undefined;
}

async function eventTypes(invoiceId: string): Promise<string[]> {
  const rows = await testDb.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, invoiceId));
  return rows.map((r) => r.type);
}

describe("invoice lifecycle", () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe("send requirements", () => {
    it("requires a client", async () => {
      const u = await setupUser();
      const draft = await makeDraft(u.id, { client: false });
      expect(await formError(markSent(u.id, draft.id, "manual"))).toEqual(["clientRequired"]);
      expect((await getInvoice(u.id, draft.id)).status).toBe("draft");
    });

    it("requires at least one item", async () => {
      const u = await setupUser();
      const draft = await makeDraft(u.id, { items: [] });
      expect(await formError(markSent(u.id, draft.id, "manual"))).toEqual(["itemsRequired"]);
    });

    it("requires a total above zero", async () => {
      const u = await setupUser();
      const draft = await makeDraft(u.id, { items: [item({ unitPriceMinor: 0 })] });
      expect(await formError(markSent(u.id, draft.id, "manual"))).toEqual(["totalZero"]);
    });

    it("assertSendable passes for a complete draft", async () => {
      const u = await setupUser();
      const draft = await makeDraft(u.id);
      const full = await getInvoice(u.id, draft.id);
      expect(() => assertSendable(full)).not.toThrow();
      expect(() => assertSendable({ ...full, items: [] })).toThrow(ValidationError);
    });
  });

  describe("markSent", () => {
    it("moves a complete draft to sent, sets sentAt and logs `sent` with the channel", async () => {
      const u = await setupUser();
      const draft = await makeDraft(u.id);
      const sent = await markSent(u.id, draft.id, "manual");

      expect(sent.status).toBe("sent");
      expect(sent.sentAt).toBeInstanceOf(Date);
      const events = await listEvents(u.id, draft.id);
      const sentEvent = events.find((e) => e.type === "sent");
      expect(sentEvent?.meta).toEqual({ channel: "manual" });
    });

    it("on an already sent invoice keeps the status and only logs the share event", async () => {
      const u = await setupUser();
      const draft = await sentInvoice(u.id);
      const before = (await getInvoice(u.id, draft.id)).sentAt;

      await markSent(u.id, draft.id, "link");
      await markSent(u.id, draft.id, "whatsapp");
      await markSent(u.id, draft.id, "email");
      await markSent(u.id, draft.id, "manual");

      const after = await getInvoice(u.id, draft.id);
      expect(after.status).toBe("sent");
      expect(after.sentAt).toEqual(before);
      const types = await eventTypes(draft.id);
      expect(types.filter((t) => t === "link_copied")).toHaveLength(1);
      expect(types.filter((t) => t === "shared_whatsapp")).toHaveLength(1);
      expect(types.filter((t) => t === "sent_email")).toHaveLength(1);
      expect(types.filter((t) => t === "sent")).toHaveLength(1);
    });

    it("is rejected for a void invoice", async () => {
      const u = await setupUser();
      const draft = await sentInvoice(u.id);
      await voidInvoice(u.id, draft.id);
      expect(await formError(markSent(u.id, draft.id, "link"))).toEqual(["invalidTransition"]);
    });
  });

  describe("markPaid / unmarkPaid", () => {
    it("marks a sent invoice paid at the start of that day in Jakarta, and unmarks it", async () => {
      const u = await setupUser();
      const draft = await sentInvoice(u.id);

      const paid = await markPaid(u.id, draft.id, { paidOn: "2026-10-20", note: "Transfer BCA" });
      expect(paid.status).toBe("paid");
      expect(paid.paidAt?.toISOString()).toBe("2026-10-19T17:00:00.000Z");
      expect(paid.paidNote).toBe("Transfer BCA");
      expect(await eventTypes(draft.id)).toContain("marked_paid");

      const back = await unmarkPaid(u.id, draft.id);
      expect(back.status).toBe("sent");
      expect(back.paidAt).toBeNull();
      expect(back.paidNote).toBeNull();
      expect(await eventTypes(draft.id)).toContain("unmarked_paid");
    });

    it("rejects a malformed paid date", async () => {
      const u = await setupUser();
      const draft = await sentInvoice(u.id);
      await expect(markPaid(u.id, draft.id, { paidOn: "20-10-2026" })).rejects.toBeInstanceOf(ValidationError);
      expect((await getInvoice(u.id, draft.id)).status).toBe("sent");
    });

    it("rejects invalid transitions", async () => {
      const u = await setupUser();
      const draft = await makeDraft(u.id);
      expect(await formError(markPaid(u.id, draft.id, { paidOn: "2026-10-20" }))).toEqual(["invalidTransition"]);
      expect(await formError(unmarkPaid(u.id, draft.id))).toEqual(["invalidTransition"]);

      await markSent(u.id, draft.id, "manual");
      expect(await formError(unmarkPaid(u.id, draft.id))).toEqual(["invalidTransition"]);
      await markPaid(u.id, draft.id, { paidOn: "2026-10-20" });
      expect(await formError(markPaid(u.id, draft.id, { paidOn: "2026-10-21" }))).toEqual(["invalidTransition"]);
    });

    it("marks a payment_claimed invoice paid", async () => {
      const u = await setupUser();
      const draft = await sentInvoice(u.id);
      await testDb.update(invoices).set({ status: "payment_claimed" }).where(eq(invoices.id, draft.id));
      expect((await markPaid(u.id, draft.id, { paidOn: "2026-10-20" })).status).toBe("paid");
    });
  });

  describe("voidInvoice", () => {
    it("voids a sent invoice and then locks edits", async () => {
      const u = await setupUser();
      const draft = await sentInvoice(u.id);

      const voided = await voidInvoice(u.id, draft.id);
      expect(voided.status).toBe("void");
      expect(voided.voidedAt).toBeInstanceOf(Date);
      expect(await eventTypes(draft.id)).toContain("voided");

      const current = await getInvoice(u.id, draft.id);
      const today = todayInJakarta();
      expect(
        await formError(
          saveInvoiceDraft(u.id, draft.id, {
            clientId: current.clientId,
            number: current.number,
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
            items: [item()],
          }),
        ),
      ).toEqual(["invoiceLocked"]);
    });

    it("voids a draft", async () => {
      const u = await setupUser();
      const draft = await makeDraft(u.id, { client: false, items: [] });
      expect((await voidInvoice(u.id, draft.id)).status).toBe("void");
    });

    it("rejects voiding a paid or already void invoice", async () => {
      const u = await setupUser();
      const draft = await sentInvoice(u.id);
      await markPaid(u.id, draft.id, { paidOn: "2026-10-20" });
      expect(await formError(voidInvoice(u.id, draft.id))).toEqual(["invalidTransition"]);

      const other = await sentInvoice(u.id);
      await voidInvoice(u.id, other.id);
      expect(await formError(voidInvoice(u.id, other.id))).toEqual(["invalidTransition"]);
    });
  });

  describe("recordPublicView", () => {
    async function token(id: string) {
      const [row] = await testDb.select().from(invoices).where(eq(invoices.id, id));
      return row.publicToken;
    }
    const viewedEvents = async (id: string) => (await eventTypes(id)).filter((t) => t === "viewed");

    it("ignores the owner", async () => {
      const u = await setupUser();
      const draft = await sentInvoice(u.id);
      await recordPublicView(await token(draft.id), u.id);
      expect((await getInvoice(u.id, draft.id)).firstViewedAt).toBeNull();
      expect(await viewedEvents(draft.id)).toHaveLength(0);
    });

    it("records the first anonymous or foreign view once", async () => {
      const u = await setupUser();
      const other = await createTestUser();
      const draft = await sentInvoice(u.id);
      const t = await token(draft.id);

      await recordPublicView(t, null);
      const first = (await getInvoice(u.id, draft.id)).firstViewedAt;
      expect(first).toBeInstanceOf(Date);
      expect(await viewedEvents(draft.id)).toHaveLength(1);

      await recordPublicView(t, null);
      await recordPublicView(t, other.id);
      expect((await getInvoice(u.id, draft.id)).firstViewedAt).toEqual(first);
      expect(await viewedEvents(draft.id)).toHaveLength(1);
    });

    it("counts concurrent first views once", async () => {
      const u = await setupUser();
      const draft = await sentInvoice(u.id);
      const t = await token(draft.id);
      await Promise.all([recordPublicView(t, null), recordPublicView(t, null), recordPublicView(t, null)]);
      expect(await viewedEvents(draft.id)).toHaveLength(1);
    });

    it("skips link-preview bots and still records the next real visit", async () => {
      const u = await setupUser();
      const draft = await sentInvoice(u.id);
      const t = await token(draft.id);

      await recordPublicView(t, null, "WhatsApp/2.23.20.0 A");
      await recordPublicView(t, null, "facebookexternalhit/1.1");
      expect((await getInvoice(u.id, draft.id)).firstViewedAt).toBeNull();
      expect(await viewedEvents(draft.id)).toHaveLength(0);

      await recordPublicView(t, null, "Mozilla/5.0 (iPhone) Safari/604.1");
      expect((await getInvoice(u.id, draft.id)).firstViewedAt).toBeInstanceOf(Date);
      expect(await viewedEvents(draft.id)).toHaveLength(1);
    });

    it("does nothing for a draft, a void invoice or an unknown token", async () => {
      const u = await setupUser();
      const draft = await makeDraft(u.id);
      await recordPublicView(await token(draft.id), null);
      expect((await getInvoice(u.id, draft.id)).firstViewedAt).toBeNull();

      const voided = await sentInvoice(u.id);
      await voidInvoice(u.id, voided.id);
      await recordPublicView(await token(voided.id), null);
      expect((await getInvoice(u.id, voided.id)).firstViewedAt).toBeNull();

      await expect(recordPublicView("does-not-exist", null)).resolves.toBeUndefined();
    });
  });

  describe("listEvents", () => {
    it("lists the newest first", async () => {
      const u = await setupUser();
      const draft = await sentInvoice(u.id);
      await markSent(u.id, draft.id, "link");
      const events = await listEvents(u.id, draft.id);
      expect(events.map((e) => e.type)).toEqual(["link_copied", "sent", "created"]);
      const rows = await testDb
        .select()
        .from(invoiceEvents)
        .where(eq(invoiceEvents.invoiceId, draft.id))
        .orderBy(desc(invoiceEvents.createdAt));
      expect(events).toHaveLength(rows.length);
    });
  });

  describe("cross-user access", () => {
    it("throws NotFoundError for every function with another user's invoice", async () => {
      const owner = await setupUser();
      const intruder = await setupUser();
      const draft = await sentInvoice(owner.id);

      await expect(markSent(intruder.id, draft.id, "link")).rejects.toBeInstanceOf(NotFoundError);
      await expect(markPaid(intruder.id, draft.id, { paidOn: "2026-10-20" })).rejects.toBeInstanceOf(NotFoundError);
      await expect(unmarkPaid(intruder.id, draft.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(voidInvoice(intruder.id, draft.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(listEvents(intruder.id, draft.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(markSent(intruder.id, "not-a-uuid", "link")).rejects.toBeInstanceOf(NotFoundError);

      expect((await getInvoice(owner.id, draft.id)).status).toBe("sent");
    });
  });
});
