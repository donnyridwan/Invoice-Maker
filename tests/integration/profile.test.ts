import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { businessProfiles } from "@/db/schema";
import { createPaymentAccount } from "@/features/payment-accounts/queries";
import {
  completeOnboarding,
  ensureProfile,
  getChecklist,
  getProfile,
  setLogoUrl,
  updateInvoiceDefaults,
  updateProfile,
} from "@/features/profile/queries";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createTestUser, resetDb, testDb } from "./helpers";

const profileInput = (overrides: Record<string, unknown> = {}) => ({
  businessName: "Studio Donny",
  baseCurrency: "IDR",
  defaultCurrency: "IDR",
  ...overrides,
});

const defaultsInput = (overrides: Record<string, unknown> = {}) => ({
  invoicePrefix: "INV-",
  defaultDueDays: 14,
  defaultLanguage: "id",
  defaultTemplate: "minimal",
  accentColor: "#5850EC",
  ...overrides,
});

describe("business profile", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("ensureProfile is idempotent and applies the defaults", async () => {
    const u = await createTestUser();
    await ensureProfile(u.id, { businessName: "Donny", email: u.email });
    await ensureProfile(u.id, { businessName: "Other", email: "other@example.test" });

    const rows = await testDb.select().from(businessProfiles).where(eq(businessProfiles.userId, u.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      businessName: "Donny",
      email: u.email,
      invoicePrefix: "INV-",
      defaultDueDays: 14,
      baseCurrency: "IDR",
      accentColor: "#111111",
      onboardingCompletedAt: null,
    });
  });

  it("updateProfile validates and saves, clearing optional fields", async () => {
    const u = await createTestUser();
    await ensureProfile(u.id, { businessName: "Donny", email: u.email });

    await expect(updateProfile(u.id, profileInput({ businessName: "" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(updateProfile(u.id, profileInput({ email: "not-an-email" }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(updateProfile(u.id, profileInput({ baseCurrency: "XXX" }))).rejects.toBeInstanceOf(ValidationError);
    await expect(updateProfile(u.id, profileInput({ address: "x".repeat(2001) }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect((await getProfile(u.id)).businessName).toBe("Donny");

    await updateProfile(u.id, profileInput({ phone: "0812", address: "Jl. Sudirman 1", baseCurrency: "USD" }));
    expect(await getProfile(u.id)).toMatchObject({
      businessName: "Studio Donny",
      phone: "0812",
      address: "Jl. Sudirman 1",
      baseCurrency: "USD",
    });

    await updateProfile(u.id, profileInput({ phone: "" }));
    expect((await getProfile(u.id)).phone).toBeNull();
  });

  it("updateInvoiceDefaults validates the accent color, prefix and due days", async () => {
    const u = await createTestUser();
    await ensureProfile(u.id, { businessName: "Donny", email: u.email });

    await expect(updateInvoiceDefaults(u.id, defaultsInput({ accentColor: "red" }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(updateInvoiceDefaults(u.id, defaultsInput({ invoicePrefix: "bad prefix!" }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(updateInvoiceDefaults(u.id, defaultsInput({ defaultDueDays: 366 }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(updateInvoiceDefaults(u.id, defaultsInput({ defaultTemplate: "fancy" }))).rejects.toBeInstanceOf(
      ValidationError,
    );

    await updateInvoiceDefaults(
      u.id,
      defaultsInput({ invoicePrefix: "DM/", defaultDueDays: 30, defaultLanguage: "en", accentColor: "#112233" }),
    );
    expect(await getProfile(u.id)).toMatchObject({
      invoicePrefix: "DM/",
      defaultDueDays: 30,
      defaultLanguage: "en",
      accentColor: "#112233",
    });
  });

  it("getChecklist tracks profile completeness and payment accounts", async () => {
    const u = await createTestUser();
    await ensureProfile(u.id, { businessName: "Donny", email: u.email });
    expect(await getChecklist(u.id)).toEqual({ profileComplete: false, hasPaymentAccount: false, hasSentInvoice: false });

    await updateProfile(u.id, profileInput({ address: "Jl. Sudirman 1" }));
    expect(await getChecklist(u.id)).toEqual({ profileComplete: true, hasPaymentAccount: false, hasSentInvoice: false });

    await createPaymentAccount(u.id, {
      type: "bank",
      bankName: "BCA",
      accountName: "Donny",
      accountNumber: "123",
      isDefault: true,
    });
    expect(await getChecklist(u.id)).toEqual({ profileComplete: true, hasPaymentAccount: true, hasSentInvoice: false });
  });

  it("completeOnboarding stamps the time once", async () => {
    const u = await createTestUser();
    await ensureProfile(u.id, { businessName: "Donny", email: u.email });
    expect((await getProfile(u.id)).onboardingCompletedAt).toBeNull();

    await completeOnboarding(u.id);
    const first = (await getProfile(u.id)).onboardingCompletedAt;
    expect(first).toBeInstanceOf(Date);

    await completeOnboarding(u.id);
    expect((await getProfile(u.id)).onboardingCompletedAt).toEqual(first);
  });

  it("never exposes or changes another user's profile", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await ensureProfile(a.id, { businessName: "A", email: a.email });

    await expect(getProfile(b.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateProfile(b.id, profileInput())).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateInvoiceDefaults(b.id, defaultsInput())).rejects.toBeInstanceOf(NotFoundError);
    await expect(completeOnboarding(b.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getChecklist(b.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setLogoUrl(b.id, "/uploads/logo/x.png")).rejects.toBeInstanceOf(NotFoundError);

    expect(await getProfile(a.id)).toMatchObject({ businessName: "A", onboardingCompletedAt: null });
  });

  it("sets and clears the logo URL, returning the previous one", async () => {
    const u = await createTestUser();
    await ensureProfile(u.id, { businessName: "A", email: u.email });

    expect(await setLogoUrl(u.id, "/uploads/logo/one.png")).toBeNull();
    expect((await getProfile(u.id)).logoUrl).toBe("/uploads/logo/one.png");
    expect(await setLogoUrl(u.id, "/uploads/logo/two.png")).toBe("/uploads/logo/one.png");
    expect(await setLogoUrl(u.id, null)).toBe("/uploads/logo/two.png");
    expect((await getProfile(u.id)).logoUrl).toBeNull();
  });
});
