"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CurrencySelect } from "@/components/currency-select";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useServerForm } from "@/lib/use-server-form";
import { cn } from "@/lib/utils";
import { finishOnboardingAction, skipOnboardingAction } from "./actions";

export function OnboardingForm({
  businessName,
  baseCurrency,
}: {
  businessName: string;
  baseCurrency: string;
}) {
  const t = useTranslations();
  const [currency, setCurrency] = useState(baseCurrency);
  const [showBank, setShowBank] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const { pending, formError, errorFor, submit } = useServerForm<FormData>(async (data) => {
    const result = await finishOnboardingAction(data);
    if (result.ok) goTo(result.data.redirectTo);
    return result;
  });

  const bankHasError = ["bankName", "accountName", "accountNumber"].some((name) => errorFor(name));
  const bankOpen = showBank || bankHasError;

  // A full navigation, not router.push: the (app) layout's onboarding gate redirects, and a client
  // transition into it can loop right after the onboarding flag flips.
  function goTo(redirectTo: string) {
    setRedirecting(true);
    window.location.assign(redirectTo);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submit(new FormData(event.currentTarget));
  }

  async function onSkip() {
    setSkipping(true);
    try {
      const result = await skipOnboardingAction();
      if (result.ok) {
        goTo(result.data.redirectTo);
        return;
      }
      toast.error(t(`errors.${result.error}`));
    } catch {
      toast.error(t("errors.unknown"));
    }
    setSkipping(false);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormField label={t("onboarding.businessName")} htmlFor="businessName" error={errorFor("businessName")}>
        <Input id="businessName" name="businessName" defaultValue={businessName} autoFocus aria-invalid={Boolean(errorFor("businessName")) || undefined} />
      </FormField>
      <FormField label={t("settings.baseCurrency")} htmlFor="baseCurrency" hint={t("settings.baseCurrencyHint")} error={errorFor("baseCurrency")}>
        <CurrencySelect id="baseCurrency" name="baseCurrency" value={currency} onValueChange={setCurrency} />
      </FormField>

      <div className="rounded-md border border-border">
        <button
          type="button"
          aria-expanded={bankOpen}
          aria-controls="onboarding-bank"
          onClick={() => setShowBank(!bankOpen)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-fg"
        >
          {t("onboarding.addPaymentAccount")}
          <ChevronDown className={cn("size-4 text-muted transition-transform", bankOpen && "rotate-180")} />
        </button>
        {/* Kept mounted (just hidden) so the values survive collapsing the section. */}
        <div id="onboarding-bank" hidden={!bankOpen} className="flex flex-col gap-4 border-t border-border p-4">
          <p className="text-sm text-muted">{t("onboarding.paymentAccountHint")}</p>
          <FormField label={t("paymentAccounts.fields.bankName")} htmlFor="bankName" error={errorFor("bankName")}>
            <Input id="bankName" name="bankName" aria-invalid={Boolean(errorFor("bankName")) || undefined} />
          </FormField>
          <FormField label={t("paymentAccounts.fields.accountName")} htmlFor="accountName" error={errorFor("accountName")}>
            <Input id="accountName" name="accountName" aria-invalid={Boolean(errorFor("accountName")) || undefined} />
          </FormField>
          <FormField label={t("paymentAccounts.fields.accountNumber")} htmlFor="accountNumber" error={errorFor("accountNumber")}>
            <Input id="accountNumber" name="accountNumber" aria-invalid={Boolean(errorFor("accountNumber")) || undefined} />
          </FormField>
        </div>
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onSkip} disabled={pending || skipping || redirecting}>
          {t("onboarding.skip")}
        </Button>
        <Button type="submit" disabled={pending || skipping || redirecting}>
          {t("onboarding.continue")}
        </Button>
      </div>
    </form>
  );
}
