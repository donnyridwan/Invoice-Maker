"use server";

import { revalidatePath } from "next/cache";
import { createDraftInvoice } from "@/features/invoices/queries";
import { createPaymentAccount } from "@/features/payment-accounts/queries";
import { paymentAccountSchema } from "@/features/payment-accounts/schema";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { ValidationError } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { getStorage, uploadFile } from "@/lib/storage";
import { parseInput } from "@/lib/validate";
import {
  completeOnboarding,
  getProfile,
  profileToInput,
  setLogoUrl,
  updateInvoiceDefaults,
  updateProfile,
} from "./queries";
import { profileSchema } from "./schema";

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export type OnboardingResult = { redirectTo: string };

/**
 * Where to go once onboarding is done: the editor of a fresh first draft (so the user lands
 * straight in the product), or the dashboard when onboarding had already been completed earlier
 * (the page was reopened) or the draft could not be created.
 */
async function onboardingRedirect(userId: string, firstTime: boolean): Promise<OnboardingResult> {
  if (!firstTime) return { redirectTo: "/dashboard" };
  try {
    const draft = await createDraftInvoice(userId);
    revalidatePath("/invoices");
    return { redirectTo: `/invoices/${draft.id}/edit` };
  } catch (e) {
    console.error(e);
    return { redirectTo: "/dashboard" };
  }
}

export async function saveProfileAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await updateProfile(user.id, input);
    refresh();
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveInvoiceDefaultsAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await updateInvoiceDefaults(user.id, input);
    refresh();
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Saves the business name and base currency, optionally creates a first bank account, and marks
 * onboarding as done. Everything is validated before anything is written.
 */
export async function finishOnboardingAction(formData: FormData): Promise<ActionResult<OnboardingResult>> {
  const user = await requireUser();
  try {
    const existing = await getProfile(user.id);
    const firstTime = !existing.onboardingCompletedAt;
    const current = profileToInput(existing);
    const baseCurrency = text(formData, "baseCurrency") || current.baseCurrency;
    const profile = parseInput(profileSchema, {
      ...current,
      businessName: text(formData, "businessName"),
      baseCurrency,
      defaultCurrency: baseCurrency,
    });

    const bank = {
      type: "bank" as const,
      bankName: text(formData, "bankName"),
      accountName: text(formData, "accountName"),
      accountNumber: text(formData, "accountNumber"),
      currency: baseCurrency,
      isDefault: true,
    };
    const hasBank = Boolean(bank.bankName || bank.accountName || bank.accountNumber);
    if (hasBank) parseInput(paymentAccountSchema, bank);

    await updateProfile(user.id, profile);
    if (hasBank) await createPaymentAccount(user.id, bank);
    await completeOnboarding(user.id);
    refresh();
    return { ok: true, data: await onboardingRedirect(user.id, firstTime) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function skipOnboardingAction(): Promise<ActionResult<OnboardingResult>> {
  const user = await requireUser();
  try {
    const firstTime = !(await getProfile(user.id)).onboardingCompletedAt;
    await completeOnboarding(user.id);
    refresh();
    return { ok: true, data: await onboardingRedirect(user.id, firstTime) };
  } catch (e) {
    return toActionError(e);
  }
}

export type LogoResult = { logoUrl: string | null };

/** Best-effort removal of a stored file that nothing references; it must never fail the action. */
async function discardUnreferencedFile(url: string) {
  try {
    await getStorage().delete(url);
  } catch (e) {
    console.error(e);
  }
}

// Replacing or removing the logo never deletes the old file: invoices keep a snapshot of the logo
// URL (paid / void / unedited sent invoices must keep rendering it), so only the profile changes.

export async function uploadLogoAction(formData: FormData): Promise<ActionResult<LogoResult>> {
  const user = await requireUser();
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError({ file: ["required"] });
    const { url } = await uploadFile("logo", file);
    try {
      await setLogoUrl(user.id, url);
    } catch (e) {
      // The new file was never referenced by anything, so it is safe to drop.
      await discardUnreferencedFile(url);
      throw e;
    }
    refresh();
    return { ok: true, data: { logoUrl: url } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeLogoAction(): Promise<ActionResult<LogoResult>> {
  const user = await requireUser();
  try {
    await setLogoUrl(user.id, null);
    refresh();
    return { ok: true, data: { logoUrl: null } };
  } catch (e) {
    return toActionError(e);
  }
}
