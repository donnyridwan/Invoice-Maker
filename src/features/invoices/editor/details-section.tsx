"use client";

import { useLocale, useTranslations } from "next-intl";
import { CurrencySelect } from "@/components/currency-select";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INVOICE_LANGUAGES, type InvoiceLanguage } from "@/features/profile/schema";
import { resolveLocale } from "@/i18n/config";
import { addDays, daysBetween, isIsoDate, todayInJakarta } from "@/lib/dates";
import { EditorSection, useErrorText, type EditorSectionProps } from "./editor-section";

/** Quick due dates, in days after the issue date (0 = on receipt). */
const TERMS = [0, 7, 14, 30] as const;

export function DetailsSection({ state, errors, update }: EditorSectionProps) {
  const t = useTranslations("invoices.editor");
  const tLanguages = useTranslations("settings.languages");
  const tDate = useTranslations("datePicker");
  const locale = resolveLocale(useLocale());
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

  const termLabel = (days: number) => (days === 0 ? t("details.onReceipt") : t("details.days", { count: days }));
  // The quick terms sit in the due date's calendar, as dates counted from the issue date.
  const termPresets = isIsoDate(state.issueDate)
    ? TERMS.map((days) => ({ label: termLabel(days), date: addDays(state.issueDate, days) }))
    : [];

  return (
    // The fields carry their own labels; the step heading names the part.
    <EditorSection title={t("sections.details")} hideTitle>
      {/* The number on its own row; under it a short currency field (a three-letter code) and the language. */}
      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-4">
        <FormField
          label={t("details.number")}
          htmlFor="invoice-number"
          error={errorText("number")}
          className="col-span-2"
        >
          <Input
            id="invoice-number"
            value={state.number}
            onChange={(event) => update({ number: event.target.value })}
            autoComplete="off"
            aria-invalid={Boolean(errors.number) || undefined}
          />
        </FormField>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t("details.issueDate")} htmlFor="invoice-issue-date" error={errorText("issueDate")}>
          <DatePicker
            id="invoice-issue-date"
            value={state.issueDate}
            onChange={changeIssueDate}
            language={locale}
            presets={[{ label: tDate("today"), date: todayInJakarta() }]}
            invalid={Boolean(errors.issueDate)}
          />
        </FormField>
        <FormField label={t("details.dueDate")} htmlFor="invoice-due-date" error={errorText("dueDate")}>
          <DatePicker
            id="invoice-due-date"
            value={state.dueDate}
            onChange={(dueDate) => update({ dueDate })}
            language={locale}
            presets={termPresets}
            presetsLabel={t("details.termsLabel")}
            suffix={term !== null && term >= 0 ? termLabel(term) : undefined}
            invalid={Boolean(errors.dueDate)}
          />
        </FormField>
      </div>
    </EditorSection>
  );
}
