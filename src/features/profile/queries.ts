import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, invoices } from "@/db/schema";
import { hasActivePaymentAccount } from "@/features/payment-accounts/queries";
import type { Locale } from "@/i18n/config";
import { NotFoundError } from "@/lib/errors";
import { parseInput } from "@/lib/validate";
import { invoiceDefaultsSchema, profileSchema } from "./schema";

export type BusinessProfile = typeof businessProfiles.$inferSelect;

const NOT_FOUND = "Business profile not found";

/** Creates the profile row with column defaults; does nothing if it already exists. */
export async function ensureProfile(
  userId: string,
  { businessName, email }: { businessName: string; email: string },
): Promise<void> {
  await db.insert(businessProfiles).values({ userId, businessName, email }).onConflictDoNothing();
}

export async function getProfile(userId: string): Promise<BusinessProfile> {
  const [row] = await db.select().from(businessProfiles).where(eq(businessProfiles.userId, userId)).limit(1);
  if (!row) throw new NotFoundError(NOT_FOUND);
  return row;
}

/** The editable profile fields of a stored profile, in the shape `updateProfile` accepts. */
export function profileToInput(profile: BusinessProfile): Record<string, string | undefined> {
  return {
    businessName: profile.businessName ?? "",
    email: profile.email ?? undefined,
    phone: profile.phone ?? undefined,
    address: profile.address ?? undefined,
    taxId: profile.taxId ?? undefined,
    baseCurrency: profile.baseCurrency,
    defaultCurrency: profile.defaultCurrency,
  };
}

export async function updateProfile(userId: string, input: unknown): Promise<BusinessProfile> {
  const data = parseInput(profileSchema, input);
  const [row] = await db
    .update(businessProfiles)
    .set({
      businessName: data.businessName,
      email: data.email ?? null,
      phone: data.phone ?? null,
      address: data.address ?? null,
      taxId: data.taxId ?? null,
      baseCurrency: data.baseCurrency,
      defaultCurrency: data.defaultCurrency,
    })
    .where(eq(businessProfiles.userId, userId))
    .returning();
  if (!row) throw new NotFoundError(NOT_FOUND);
  return row;
}

export async function updateInvoiceDefaults(userId: string, input: unknown): Promise<BusinessProfile> {
  const data = parseInput(invoiceDefaultsSchema, input);
  const [row] = await db
    .update(businessProfiles)
    .set({
      invoicePrefix: data.invoicePrefix,
      defaultDueDays: data.defaultDueDays,
      defaultLanguage: data.defaultLanguage,
      defaultNotes: data.defaultNotes ?? null,
      defaultTemplate: data.defaultTemplate,
      accentColor: data.accentColor,
    })
    .where(eq(businessProfiles.userId, userId))
    .returning();
  if (!row) throw new NotFoundError(NOT_FOUND);
  return row;
}

/** Sets (or clears, with null) the logo URL and returns the previous one. The old file is never deleted: invoice snapshots may still point to it. */
export async function setLogoUrl(userId: string, logoUrl: string | null): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ logoUrl: businessProfiles.logoUrl })
      .from(businessProfiles)
      .where(eq(businessProfiles.userId, userId))
      .for("update")
      .limit(1);
    if (!current) throw new NotFoundError(NOT_FOUND);
    await tx.update(businessProfiles).set({ logoUrl }).where(eq(businessProfiles.userId, userId));
    return current.logoUrl;
  });
}

/** Stamps the completion time once; later calls keep the first timestamp. */
export async function completeOnboarding(userId: string): Promise<void> {
  const rows = await db
    .update(businessProfiles)
    .set({ onboardingCompletedAt: sql`coalesce(${businessProfiles.onboardingCompletedAt}, now())` })
    .where(eq(businessProfiles.userId, userId))
    .returning({ userId: businessProfiles.userId });
  if (rows.length === 0) throw new NotFoundError(NOT_FOUND);
}

/**
 * Whether the user has finished (or skipped) onboarding. Creates the profile row first if it is
 * missing (e.g. a user created before profiles existed), in which case onboarding is pending.
 */
export async function isOnboardingComplete(user: { id: string; name: string; email: string }): Promise<boolean> {
  const select = () =>
    db
      .select({ completedAt: businessProfiles.onboardingCompletedAt })
      .from(businessProfiles)
      .where(eq(businessProfiles.userId, user.id))
      .limit(1);
  let [row] = await select();
  if (!row) {
    await ensureProfile(user.id, { businessName: user.name, email: user.email });
    [row] = await select();
  }
  return Boolean(row?.completedAt);
}

/** Whether the user ever sent an invoice (it may have been paid or voided since). */
export async function hasSentInvoice(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.userId, userId), isNotNull(invoices.sentAt)))
    .limit(1);
  return Boolean(row);
}

export async function getChecklist(
  userId: string,
): Promise<{ profileComplete: boolean; hasPaymentAccount: boolean; hasSentInvoice: boolean }> {
  const profile = await getProfile(userId);
  return {
    profileComplete: Boolean(profile.businessName?.trim()) && Boolean(profile.address?.trim()),
    hasPaymentAccount: await hasActivePaymentAccount(userId),
    hasSentInvoice: await hasSentInvoice(userId),
  };
}

/** Remembers the UI language chosen by the user. A user without a profile row is ignored. */
export async function updateUiLocale(userId: string, locale: Locale): Promise<void> {
  await db.update(businessProfiles).set({ uiLocale: locale }).where(eq(businessProfiles.userId, userId));
}
