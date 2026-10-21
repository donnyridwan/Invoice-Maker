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
    <EditorSection title={t("sections.totals")}>
      <dl className="flex flex-col gap-3 text-sm tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted">{t("totals.subtotal")}</dt>
          <dd className="font-medium text-fg">{money(evaluation.subtotalMinor)}</dd>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted">{t("totals.discount")}</dt>
            <dd className="font-medium text-fg">
              {evaluation.discountMinor > 0 ? `−${money(evaluation.discountMinor)}` : money(0)}
            </dd>
          </div>
          <div className="flex items-start gap-2">
            <Select
              value={state.discountType}
              onValueChange={(value) =>
                update({ discountType: value as DiscountType, ...(value === "none" ? { discountValue: "" } : {}) })
              }
            >
              <SelectTrigger aria-label={t("totals.discountType")} className="w-40">
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
            {state.discountType !== "none" ? (
              <div className="min-w-0 flex-1">
                <div className="relative">
                  <Input
                    aria-label={t("totals.discountValue")}
                    inputMode="decimal"
                    value={state.discountValue}
                    onChange={(event) => update({ discountValue: event.target.value })}
                    aria-invalid={Boolean(discountError) || undefined}
                    className="pr-11 text-right tabular-nums"
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
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border pt-3 text-lg">
          <dt className="font-bold text-fg">{t("totals.total")}</dt>
          <dd className="font-extrabold tracking-tight text-accent">{money(evaluation.totalMinor)}</dd>
        </div>
      </dl>
    </EditorSection>
  );
}
