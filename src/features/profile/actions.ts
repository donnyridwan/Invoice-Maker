"use server";

import { revalidatePath } from "next/cache";
import { createPaymentAccount } from "@/features/payment-accounts/queries";
import { paymentAccountSchema } from "@/features/payment-accounts/schema";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/session";
import { parseInput } from "@/lib/validate";
import {
  completeOnboarding,
  getProfile,
  profileToInput,
  updateInvoiceDefaults,
  updateProfile,
} from "./queries";
import { profileSchema } from "./schema";

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/dashboard");
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
export async function finishOnboardingAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const current = profileToInput(await getProfile(user.id));
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
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

export async function skipOnboardingAction(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await completeOnboarding(user.id);
    refresh();
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}
