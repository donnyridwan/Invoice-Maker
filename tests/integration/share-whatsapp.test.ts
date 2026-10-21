import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { businessProfiles, invoiceEvents } from "@/db/schema";
import { createClient } from "@/features/clients/queries";
import { markSent, voidInvoice } from "@/features/invoices/lifecycle";
import { createDraftInvoice, getInvoice, saveInvoiceDraft } from "@/features/invoices/queries";
import { shareWhatsApp } from "@/features/invoices/share-whatsapp";
import { ensureProfile } from "@/features/profile/queries";
import { addDays, todayInJakarta } from "@/lib/dates";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createTestUser, resetDb, testDb } from "./helpers";

const BASE = "https://app.example";

async function setupOwner() {
  const u = await createTestUser({ name: "Donny" });
  await ensureProfile(u.id, { businessName: "Studio Donny", email: "donny@example.test" });
  await testDb.update(businessProfiles).set({ invoicePrefix: "INV-" }).where(eq(businessProfiles.userId, u.id));
  return u.id;
}

async function draftInvoice(userId: string, opts: { phone?: string; withClient?: boolean; language?: "id" | "en" } = {}) {
  const draft = await createDraftInvoice(userId);
  const client =
    opts.withClient === false
      ? null
      : await createClient(userId, { name: "PT Maju Jaya", phone: opts.phone, defaultCurrency: "IDR" });
  const today = todayInJakarta();
  await saveInvoiceDraft(userId, draft.id, {
    clientId: client?.id ?? null,
    number: draft.number,
    issueDate: today,
    dueDate: addDays(today, 14),
    currency: "IDR",
    language: opts.language ?? "id",
    template: "minimal",
    accentColor: "#5850EC",
    discountType: "none",
    discountValue: 0,
    notes: "",
    paymentAccountIds: [],
    items: [{ name: "Desain", description: "", quantityMilli: 1000, unitPriceMinor: 1_500_000, unit: "" }],
  });
  return getInvoice(userId, draft.id);
}

const eventsOf = (invoiceId: string) => testDb.select().from(invoiceEvents).where(eq(invoiceEvents.invoiceId, invoiceId));

describe("shareWhatsApp", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("sends a draft and returns a wa.me link to the client's number with the public link", async () => {
    const owner = await setupOwner();
    const inv = await draftInvoice(owner, { phone: "0812 3456 7890" });

    const { url } = await shareWhatsApp(owner, inv.id, BASE);

    expect(url.startsWith("https://wa.me/6281234567890?text=")).toBe(true);
    const text = new URL(url).searchParams.get("text");
    expect(text).toContain("Halo PT Maju Jaya, berikut invoice");
    expect(text).toContain(`dari Studio Donny sebesar`);
    expect(text).toContain(`${BASE}/i/${inv.publicToken}`);

    const after = await getInvoice(owner, inv.id);
    expect(after.status).toBe("sent");
    const events = await eventsOf(inv.id);
    expect(events.find((e) => e.type === "sent")?.meta).toEqual({ channel: "whatsapp" });
  });

  it("writes the message in the invoice's language", async () => {
    const owner = await setupOwner();
    const inv = await draftInvoice(owner, { language: "en" });
    const { url } = await shareWhatsApp(owner, inv.id, BASE);
    expect(new URL(url).searchParams.get("text")).toContain("Hi PT Maju Jaya, here is invoice");
  });

  it("has no recipient when the client has no usable phone number", async () => {
    const owner = await setupOwner();
    const none = await draftInvoice(owner);
    expect((await shareWhatsApp(owner, none.id, BASE)).url.startsWith("https://wa.me/?text=")).toBe(true);
    const short = await draftInvoice(owner, { phone: "123" });
    expect((await shareWhatsApp(owner, short.id, BASE)).url.startsWith("https://wa.me/?text=")).toBe(true);
  });

  it("only logs a share on an invoice that is already sent", async () => {
    const owner = await setupOwner();
    const inv = await draftInvoice(owner, { phone: "081234567890" });
    await markSent(owner, inv.id, "manual");
    await shareWhatsApp(owner, inv.id, BASE);
    const types = (await eventsOf(inv.id)).map((e) => e.type);
    expect(types.filter((t) => t === "sent")).toHaveLength(1);
    expect(types).toContain("shared_whatsapp");
  });

  it("refuses an invoice that cannot be sent, a void one and a foreign one", async () => {
    const owner = await setupOwner();
    const noClient = await draftInvoice(owner, { withClient: false });
    await expect(shareWhatsApp(owner, noClient.id, BASE)).rejects.toMatchObject({
      fieldErrors: { _form: ["clientRequired"] },
    });
    expect((await getInvoice(owner, noClient.id)).status).toBe("draft");

    const sent = await draftInvoice(owner);
    await markSent(owner, sent.id, "manual");
    await voidInvoice(owner, sent.id);
    await expect(shareWhatsApp(owner, sent.id, BASE)).rejects.toBeInstanceOf(ValidationError);

    const other = await createTestUser({ name: "Other" });
    const mine = await draftInvoice(owner);
    await expect(shareWhatsApp(other.id, mine.id, BASE)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getInvoice(owner, mine.id)).status).toBe("draft");
  });
});
