import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { businessProfiles, invoiceEvents, invoices } from "@/db/schema";
import { createClient } from "@/features/clients/queries";
import {
  createDraftInvoice,
  deleteDraftInvoice,
  duplicateInvoice,
  getInvoice,
  listInvoices,
  saveInvoiceDraft,
} from "@/features/invoices/queries";
import { createPaymentAccount } from "@/features/payment-accounts/queries";
import { ensureProfile } from "@/features/profile/queries";
import { addDays, todayInJakarta } from "@/lib/dates";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createTestUser, resetDb, testDb } from "./helpers";

const YEAR = Number(todayInJakarta().slice(0, 4));
const num = (n: number) => `INV-${YEAR}-${String(n).padStart(3, "0")}`;

async function setupUser(profile: Partial<typeof businessProfiles.$inferInsert> = {}) {
  const u = await createTestUser();
  await ensureProfile(u.id, { businessName: "Studio Donny", email: "donny@example.test" });
  await testDb
    .update(businessProfiles)
    .set({ invoicePrefix: "INV-", defaultDueDays: 14, defaultNotes: "Terima kasih", ...profile })
    .where(eq(businessProfiles.userId, u.id));
  return u;
}

const bank = { type: "bank", bankName: "BCA", accountName: "Donny", accountNumber: "1234567890", isDefault: true };

function draftInput(overrides: Record<string, unknown> = {}) {
  const today = todayInJakarta();
  return {
    clientId: null,
    number: num(1),
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
    items: [],
    ...overrides,
  };
}

const item = (overrides: Record<string, unknown> = {}) => ({
  name: "Desain",
  description: "",
  quantityMilli: 1000,
  unit: "",
  unitPriceMinor: 1_000_000,
  ...overrides,
});

describe("invoice domain", () => {
  beforeEach(async () => {
    await resetDb();
  });

  describe("createDraftInvoice", () => {
    it("fills defaults from the profile and default payment account and logs `created`", async () => {
      const u = await setupUser();
      await createPaymentAccount(u.id, bank);
      const inv = await createDraftInvoice(u.id);

      expect(inv.number).toBe(num(1));
      expect(inv.status).toBe("draft");
      expect(inv.issueDate).toBe(todayInJakarta());
      expect(inv.dueDate).toBe(addDays(inv.issueDate, 14));
      expect(inv.currency).toBe("IDR");
      expect(inv.template).toBe("minimal");
      expect(inv.notes).toBe("Terima kasih");
      expect(inv.paymentAccountsSnapshot).toHaveLength(1);
      expect(inv.businessSnapshot.businessName).toBe("Studio Donny");
      expect(inv.publicToken).toMatch(/^[A-Za-z0-9_-]{22}$/);

      const events = await testDb.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, inv.id));
      expect(events.map((e) => e.type)).toEqual(["created"]);

      const [profile] = await testDb.select().from(businessProfiles).where(eq(businessProfiles.userId, u.id));
      expect(profile.nextInvoiceNumber).toBe(2);
      expect(profile.invoiceNumberYear).toBe(YEAR);
    });

    it("takes currency and language from the given client", async () => {
      const u = await setupUser();
      const client = await createClient(u.id, { name: "Acme", defaultCurrency: "USD", defaultLanguage: "en" });
      const inv = await createDraftInvoice(u.id, { clientId: client.id });
      expect(inv.clientId).toBe(client.id);
      expect(inv.currency).toBe("USD");
      expect(inv.language).toBe("en");
      expect(inv.clientSnapshot?.name).toBe("Acme");
    });

    it("rejects a client owned by someone else", async () => {
      const u = await setupUser();
      const other = await setupUser();
      const client = await createClient(other.id, { name: "Theirs" });
      await expect(createDraftInvoice(u.id, { clientId: client.id })).rejects.toBeInstanceOf(NotFoundError);
    });

    it("allocates distinct sequential numbers for parallel creations", async () => {
      const u = await setupUser();
      const created = await Promise.all(Array.from({ length: 5 }, () => createDraftInvoice(u.id)));
      expect(created.map((i) => i.number).sort()).toEqual([1, 2, 3, 4, 5].map(num));
    });

    it("skips a number that was typed in manually", async () => {
      const u = await setupUser();
      const a = await createDraftInvoice(u.id);
      await saveInvoiceDraft(u.id, a.id, draftInput({ number: num(2) }));
      const b = await createDraftInvoice(u.id);
      expect(b.number).toBe(num(3));
    });
  });

  describe("saveInvoiceDraft", () => {
    it("recalculates totals, stores ordered items and snapshots the client", async () => {
      const u = await setupUser();
      const client = await createClient(u.id, { name: "Acme Corp" });
      const inv = await createDraftInvoice(u.id);
      const result = await saveInvoiceDraft(
        u.id,
        inv.id,
        draftInput({
          number: inv.number,
          clientId: client.id,
          discountType: "percent",
          discountValue: 1250,
          items: [
            item({ name: "Satu", quantityMilli: 2000, unitPriceMinor: 1_500_000 }),
            item({ name: "Dua", quantityMilli: 1000, unitPriceMinor: 500_000 }),
          ],
        }),
      );
      expect(result.totals).toEqual({ subtotalMinor: 3_500_000, discountMinor: 437_500, totalMinor: 3_062_500 });
      expect(typeof result.savedAt).toBe("string");

      const saved = await getInvoice(u.id, inv.id);
      expect(saved.totalMinor).toBe(3_062_500);
      expect(saved.items.map((i) => [i.position, i.name, i.amountMinor])).toEqual([
        [0, "Satu", 3_000_000],
        [1, "Dua", 500_000],
      ]);
      expect(saved.clientSnapshot?.name).toBe("Acme Corp");
      expect(saved.clientId).toBe(client.id);
    });

    it("replaces items on every save", async () => {
      const u = await setupUser();
      const inv = await createDraftInvoice(u.id);
      await saveInvoiceDraft(u.id, inv.id, draftInput({ number: inv.number, items: [item(), item({ name: "B" })] }));
      await saveInvoiceDraft(u.id, inv.id, draftInput({ number: inv.number, items: [item({ name: "Only" })] }));
      const saved = await getInvoice(u.id, inv.id);
      expect(saved.items.map((i) => i.name)).toEqual(["Only"]);
    });

    it("keeps snapshots frozen until the next save", async () => {
      const u = await setupUser();
      const client = await createClient(u.id, { name: "Acme" });
      const inv = await createDraftInvoice(u.id);
      const input = draftInput({ number: inv.number, clientId: client.id });
      await saveInvoiceDraft(u.id, inv.id, input);

      const { updateClient } = await import("@/features/clients/queries");
      await updateClient(u.id, client.id, { name: "Acme Renamed", defaultCurrency: "IDR", defaultLanguage: "id" });
      expect((await getInvoice(u.id, inv.id)).clientSnapshot?.name).toBe("Acme");

      await saveInvoiceDraft(u.id, inv.id, input);
      expect((await getInvoice(u.id, inv.id)).clientSnapshot?.name).toBe("Acme Renamed");
    });

    it("rejects a foreign client without changing the invoice", async () => {
      const u = await setupUser();
      const other = await setupUser();
      const foreign = await createClient(other.id, { name: "Theirs" });
      const inv = await createDraftInvoice(u.id);
      const before = await getInvoice(u.id, inv.id);
      await expect(
        saveInvoiceDraft(u.id, inv.id, draftInput({ number: "CHANGED-1", clientId: foreign.id, items: [item()] })),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(await getInvoice(u.id, inv.id)).toEqual(before);
    });

    it("rejects a foreign payment account", async () => {
      const u = await setupUser();
      const other = await setupUser();
      const theirs = await createPaymentAccount(other.id, bank);
      const inv = await createDraftInvoice(u.id);
      await expect(
        saveInvoiceDraft(u.id, inv.id, draftInput({ number: inv.number, paymentAccountIds: [theirs.id] })),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("rejects a due date before the issue date", async () => {
      const u = await setupUser();
      const inv = await createDraftInvoice(u.id);
      const err = await saveInvoiceDraft(
        u.id,
        inv.id,
        draftInput({ number: inv.number, issueDate: "2026-10-21", dueDate: "2026-10-20" }),
      ).catch((e) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.fieldErrors.dueDate).toEqual(["dueBeforeIssue"]);
    });

    it("rejects a number used by another invoice", async () => {
      const u = await setupUser();
      const a = await createDraftInvoice(u.id);
      const b = await createDraftInvoice(u.id);
      const err = await saveInvoiceDraft(u.id, b.id, draftInput({ number: a.number })).catch((e) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.fieldErrors.number).toEqual(["duplicateNumber"]);
    });

    it("lets only one of two concurrent saves claim the same number", async () => {
      const u = await setupUser();
      const a = await createDraftInvoice(u.id);
      const b = await createDraftInvoice(u.id);
      const results = await Promise.allSettled([
        saveInvoiceDraft(u.id, a.id, draftInput({ number: "RACE-1" })),
        saveInvoiceDraft(u.id, b.id, draftInput({ number: "RACE-1" })),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(ValidationError);
      expect(rejected.reason.fieldErrors.number).toEqual(["duplicateNumber"]);
    });

    it("rejects invalid input shapes", async () => {
      const u = await setupUser();
      const inv = await createDraftInvoice(u.id);
      const err = await saveInvoiceDraft(
        u.id,
        inv.id,
        draftInput({ number: "bad number!", discountType: "percent", discountValue: 10001 }),
      ).catch((e) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(Object.keys(err.fieldErrors)).toEqual(expect.arrayContaining(["number", "discountValue"]));
    });

    it.each(["paid", "void"] as const)("refuses to save a %s invoice", async (status) => {
      const u = await setupUser();
      const inv = await createDraftInvoice(u.id);
      await testDb.update(invoices).set({ status }).where(eq(invoices.id, inv.id));
      const err = await saveInvoiceDraft(
        u.id,
        inv.id,
        draftInput({ number: inv.number, items: [item()] }),
      ).catch((e) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.fieldErrors._form).toEqual(["invoiceLocked"]);
      expect((await getInvoice(u.id, inv.id)).items).toHaveLength(0);
    });

    it("logs edited_after_send at most once per 10 minutes for a sent invoice", async () => {
      const u = await setupUser();
      const inv = await createDraftInvoice(u.id);
      await testDb.update(invoices).set({ status: "sent" }).where(eq(invoices.id, inv.id));
      const input = draftInput({ number: inv.number });
      await saveInvoiceDraft(u.id, inv.id, input);
      await saveInvoiceDraft(u.id, inv.id, input);
      const events = await testDb
        .select()
        .from(invoiceEvents)
        .where(and(eq(invoiceEvents.invoiceId, inv.id), eq(invoiceEvents.type, "edited_after_send")));
      expect(events).toHaveLength(1);
    });
  });

  describe("duplicateInvoice", () => {
    it("copies fields and items into a fresh draft with the next number", async () => {
      const u = await setupUser();
      const src = await createDraftInvoice(u.id);
      const issue = todayInJakarta();
      await saveInvoiceDraft(
        u.id,
        src.id,
        draftInput({
          number: src.number,
          issueDate: addDays(issue, -10),
          dueDate: addDays(issue, 20),
          items: [item({ name: "A" }), item({ name: "B" })],
          notes: "Catatan",
        }),
      );
      await testDb
        .update(invoices)
        .set({ status: "paid", sentAt: new Date(), paidAt: new Date(), paidNote: "ok" })
        .where(eq(invoices.id, src.id));

      const copy = await duplicateInvoice(u.id, src.id);
      expect(copy.id).not.toBe(src.id);
      expect(copy.number).toBe(num(2));
      expect(copy.status).toBe("draft");
      expect(copy.issueDate).toBe(issue);
      expect(copy.dueDate).toBe(addDays(issue, 30));
      expect(copy.publicToken).not.toBe(src.publicToken);
      expect(copy.sentAt).toBeNull();
      expect(copy.paidAt).toBeNull();
      expect(copy.paidNote).toBeNull();
      expect(copy.notes).toBe("Catatan");

      const full = await getInvoice(u.id, copy.id);
      expect(full.items.map((i) => i.name)).toEqual(["A", "B"]);
      const events = await testDb.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, copy.id));
      expect(events.map((e) => [e.type, e.meta])).toEqual([["duplicated", { sourceInvoiceId: src.id }]]);
    });
  });

  describe("deleteDraftInvoice", () => {
    it("deletes drafts but not other statuses", async () => {
      const u = await setupUser();
      const sent = await createDraftInvoice(u.id);
      await testDb.update(invoices).set({ status: "sent" }).where(eq(invoices.id, sent.id));
      const err = await deleteDraftInvoice(u.id, sent.id).catch((e) => e);
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.fieldErrors._form).toEqual(["onlyDraftDeletable"]);

      const draft = await createDraftInvoice(u.id);
      await deleteDraftInvoice(u.id, draft.id);
      await expect(getInvoice(u.id, draft.id)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("ownership", () => {
    it("treats another user's invoice as not found everywhere", async () => {
      const u = await setupUser();
      const other = await setupUser();
      const inv = await createDraftInvoice(other.id);
      await expect(getInvoice(u.id, inv.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(saveInvoiceDraft(u.id, inv.id, draftInput({ number: inv.number }))).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(duplicateInvoice(u.id, inv.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(deleteDraftInvoice(u.id, inv.id)).rejects.toBeInstanceOf(NotFoundError);
      await expect(getInvoice(u.id, "not-a-uuid")).rejects.toBeInstanceOf(NotFoundError);
      expect(await getInvoice(other.id, inv.id)).toMatchObject({ id: inv.id });
    });
  });

  describe("listInvoices", () => {
    it("lists own invoices newest first and searches by number and client name", async () => {
      const u = await setupUser();
      const other = await setupUser();
      await createDraftInvoice(other.id);
      const client = await createClient(u.id, { name: "Acme Corp" });
      const a = await createDraftInvoice(u.id);
      const b = await createDraftInvoice(u.id, { clientId: client.id });

      const all = await listInvoices(u.id, {});
      expect(all.map((i) => i.id)).toEqual([b.id, a.id]);

      expect((await listInvoices(u.id, { search: "acme" })).map((i) => i.id)).toEqual([b.id]);
      expect((await listInvoices(u.id, { search: a.number })).map((i) => i.id)).toEqual([a.id]);
      expect(await listInvoices(u.id, { search: "zzz" })).toEqual([]);
      expect(await listInvoices(u.id, { search: "%" })).toEqual([]);
    });
  });
});
