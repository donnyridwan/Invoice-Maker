"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Locale } from "@/i18n/config";
import { isCurrencyCode } from "@/lib/currencies";
import type { DiscountType } from "@/lib/invoice-calc";
import { formatMoney } from "@/lib/money";
import type { EditorEvaluation } from "../editor-state";
import { EditorSection, useErrorText, type EditorSectionProps } from "./editor-section";

const DISCOUNT_TYPES: { value: DiscountType; labelKey: string }[] = [
  { value: "none", labelKey: "discountNone" },
  { value: "percent", labelKey: "discountPercent" },
  { value: "fixed", labelKey: "discountFixed" },
];

export function TotalsSection({
  state,
  errors,
  update,
  evaluation,
  locale,
}: EditorSectionProps & { evaluation: EditorEvaluation; locale: Locale }) {
  const t = useTranslations("invoices.editor");
  const errorText = useErrorText(errors);
  const currency = isCurrencyCode(state.currency) ? state.currency : "IDR";
  const money = (minor: number) => formatMoney(minor, currency, locale);
  const discountError = errorText("discountValue");

  return (
    // Reads as the foot of the items table: right-aligned, like the totals on the invoice itself.
    <EditorSection title={t("sections.totals")} hideTitle className="border-t-0 pt-0">
      <dl className="ml-auto flex w-full max-w-sm flex-col gap-2.5 text-sm tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">{t("totals.subtotal")}</dt>
          <dd className="text-fg">{money(evaluation.subtotalMinor)}</dd>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-muted">
              {t("totals.discount")}
              <Select
                value={state.discountType}
                onValueChange={(value) =>
                  update({ discountType: value as DiscountType, ...(value === "none" ? { discountValue: "" } : {}) })
                }
              >
                <SelectTrigger aria-label={t("totals.discountType")} className="h-8 w-32 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISCOUNT_TYPES.map(({ value, labelKey }) => (
                    <SelectItem key={value} value={value}>
                      {t(`totals.${labelKey}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </dt>
            <dd className="text-fg">
              {evaluation.discountMinor > 0 ? `−${money(evaluation.discountMinor)}` : money(0)}
            </dd>
          </div>
          {state.discountType !== "none" ? (
            <div className="ml-auto w-40">
              <div className="relative">
                <Input
                  aria-label={t("totals.discountValue")}
                  inputMode="decimal"
                  value={state.discountValue}
                  onChange={(event) => update({ discountValue: event.target.value })}
                  aria-invalid={Boolean(discountError) || undefined}
                  className="h-8 pr-11 text-right text-[13px] tabular-nums"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted"
                >
                  {state.discountType === "percent" ? "%" : currency}
                </span>
              </div>
              {discountError ? <p className="mt-1 text-xs text-danger">{discountError}</p> : null}
            </div>
          ) : null}
        </div>

        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-3">
          <dt className="font-medium text-fg">{t("totals.total")}</dt>
          <dd className="font-serif text-2xl tracking-tight text-fg">{money(evaluation.totalMinor)}</dd>
        </div>
      </dl>
    </EditorSection>
  );
}
