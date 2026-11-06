import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, user } from "@/db/schema";
import type { Locale } from "@/i18n/config";
import { NotFoundError } from "@/lib/errors";
import { parseInput } from "@/lib/validate";
import { invoiceDefaultsSchema, profileSchema } from "./schema";

export type BusinessProfile = typeof businessProfiles.$inferSelect;

const NOT_FOUND = "Business profile not found";

/** Creates the profile row with column defaults; does nothing if it already exists. */
export async function ensureProfile(
  workspaceId: string,
  { businessName, email }: { businessName: string; email: string },
): Promise<void> {
  await db.insert(businessProfiles).values({ workspaceId, businessName, email }).onConflictDoNothing();
}

export async function getProfile(workspaceId: string): Promise<BusinessProfile> {
  const [row] = await db.select().from(businessProfiles).where(eq(businessProfiles.workspaceId, workspaceId)).limit(1);
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

export async function updateProfile(workspaceId: string, input: unknown): Promise<BusinessProfile> {
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
    .where(eq(businessProfiles.workspaceId, workspaceId))
    .returning();
  if (!row) throw new NotFoundError(NOT_FOUND);
  return row;
}

export async function updateInvoiceDefaults(workspaceId: string, input: unknown): Promise<BusinessProfile> {
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
    .where(eq(businessProfiles.workspaceId, workspaceId))
    .returning();
  if (!row) throw new NotFoundError(NOT_FOUND);
  return row;
}

/** Sets (or clears, with null) the logo URL and returns the previous one. The old file is never deleted: invoice snapshots may still point to it. */
export async function setLogoUrl(workspaceId: string, logoUrl: string | null): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ logoUrl: businessProfiles.logoUrl })
      .from(businessProfiles)
      .where(eq(businessProfiles.workspaceId, workspaceId))
      .for("update")
      .limit(1);
    if (!current) throw new NotFoundError(NOT_FOUND);
    await tx.update(businessProfiles).set({ logoUrl }).where(eq(businessProfiles.workspaceId, workspaceId));
    return current.logoUrl;
  });
}

/** Stamps the completion time once; later calls keep the first timestamp. */
export async function completeOnboarding(workspaceId: string): Promise<void> {
  const rows = await db
    .update(businessProfiles)
    .set({ onboardingCompletedAt: sql`coalesce(${businessProfiles.onboardingCompletedAt}, now())` })
    .where(eq(businessProfiles.workspaceId, workspaceId))
    .returning({ workspaceId: businessProfiles.workspaceId });
  if (rows.length === 0) throw new NotFoundError(NOT_FOUND);
}

/** Whether the workspace's onboarding is done (or skipped). A workspace without a profile is not onboarded. */
export async function isOnboardingComplete(workspaceId: string): Promise<boolean> {
  const [row] = await db
    .select({ completedAt: businessProfiles.onboardingCompletedAt })
    .from(businessProfiles)
    .where(eq(businessProfiles.workspaceId, workspaceId))
    .limit(1);
  return Boolean(row?.completedAt);
}

/** Remembers the UI language chosen by the user. */
export async function updateUiLocale(userId: string, locale: Locale): Promise<void> {
  await db.update(user).set({ uiLocale: locale }).where(eq(user.id, userId));
}

/** The UI language the user last picked (null for an unknown user). */
export async function getUiLocale(userId: string): Promise<string | null> {
  const [row] = await db.select({ uiLocale: user.uiLocale }).from(user).where(eq(user.id, userId)).limit(1);
  return row?.uiLocale ?? null;
}
