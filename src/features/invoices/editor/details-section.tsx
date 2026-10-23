"use client";

import { useTranslations } from "next-intl";
import { CurrencySelect } from "@/components/currency-select";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INVOICE_LANGUAGES, type InvoiceLanguage } from "@/features/profile/schema";
import { addDays, daysBetween, isIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { EditorSection, useErrorText, type EditorSectionProps } from "./editor-section";

/** Quick due dates, in days after the issue date (0 = on receipt). */
const TERMS = [0, 7, 14, 30] as const;

export function DetailsSection({ state, errors, update }: EditorSectionProps) {
  const t = useTranslations("invoices.editor");
  const tLanguages = useTranslations("settings.languages");
  const errorText = useErrorText(errors);

  const term =
    isIsoDate(state.issueDate) && isIsoDate(state.dueDate) ? daysBetween(state.issueDate, state.dueDate) : null;

  function changeIssueDate(issueDate: string) {
    update((current) => {
      // Moving the issue date keeps the payment term, so the due date never ends up before it.
      const currentTerm =
        isIsoDate(current.issueDate) && isIsoDate(current.dueDate) ? daysBetween(current.issueDate, current.dueDate) : null;
      if (isIsoDate(issueDate) && currentTerm !== null && currentTerm >= 0) {
        return { issueDate, dueDate: addDays(issueDate, currentTerm) };
      }
      return { issueDate };
    });
  }

  function chooseTerm(days: number) {
    update((current) => (isIsoDate(current.issueDate) ? { dueDate: addDays(current.issueDate, days) } : {}));
  }

  return (
    <EditorSection title={t("sections.details")}>
      <FormField label={t("details.number")} htmlFor="invoice-number" error={errorText("number")}>
        <Input
          id="invoice-number"
          value={state.number}
          onChange={(event) => update({ number: event.target.value })}
          autoComplete="off"
          aria-invalid={Boolean(errors.number) || undefined}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t("details.issueDate")} htmlFor="invoice-issue-date" error={errorText("issueDate")}>
          <Input
            id="invoice-issue-date"
            type="date"
            value={state.issueDate}
            onChange={(event) => changeIssueDate(event.target.value)}
            aria-invalid={Boolean(errors.issueDate) || undefined}
          />
        </FormField>
        <FormField label={t("details.dueDate")} htmlFor="invoice-due-date" error={errorText("dueDate")}>
          <Input
            id="invoice-due-date"
            type="date"
            value={state.dueDate}
            onChange={(event) => update({ dueDate: event.target.value })}
            aria-invalid={Boolean(errors.dueDate) || undefined}
          />
        </FormField>
      </div>

      <div role="group" aria-label={t("details.termsLabel")} className="-mt-2 flex flex-wrap gap-1.5">
        {TERMS.map((days) => {
          const active = term === days;
          return (
            <button
              key={days}
              type="button"
              aria-pressed={active}
              onClick={() => chooseTerm(days)}
              className={cn(
                "h-7 border px-2.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                active
                  ? "border-accent bg-tint text-tint-fg"
                  : "border-border bg-white text-fg hover:bg-subtle",
              )}
            >
              {days === 0 ? t("details.onReceipt") : t("details.days", { count: days })}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t("details.currency")} htmlFor="invoice-currency" error={errorText("currency")}>
          <CurrencySelect
            id="invoice-currency"
            value={state.currency}
            onValueChange={(currency) => update({ currency })}
          />
        </FormField>
        <FormField label={t("details.language")} htmlFor="invoice-language" error={errorText("language")}>
          <Select value={state.language} onValueChange={(language) => update({ language: language as InvoiceLanguage })}>
            <SelectTrigger id="invoice-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INVOICE_LANGUAGES.map((language) => (
                <SelectItem key={language} value={language}>
                  {tLanguages(language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>
    </EditorSection>
  );
}
