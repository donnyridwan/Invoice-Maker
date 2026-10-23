"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { isCurrencyCode } from "@/lib/currencies";
import { formatDocDate, isIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { EditorEvaluation, EditorState } from "../editor-state";

/**
 * The bar pinned to the bottom of the form: the invoice total with its currency, item count and due
 * date — the first thing to check before sending, always in view while editing — between the
 * step buttons (`back` on the left, `next` on the right).
 */
export function AmountHero({
  state,
  evaluation,
  locale,
  back,
  next,
}: {
  state: EditorState;
  evaluation: EditorEvaluation;
  locale: Locale;
  back?: ReactNode;
  next?: ReactNode;
}) {
  const t = useTranslations("invoices.editor.hero");
  const currency = isCurrencyCode(state.currency) ? state.currency : "IDR";
  const total = formatMoney(evaluation.totalMinor, currency, locale);
  const itemCount = evaluation.keptLineAmounts.length;
  const due =
    state.dueDate && state.dueDate === state.issueDate
      ? t("dueOnReceipt")
      : isIsoDate(state.dueDate)
        ? t("due", { date: formatDocDate(state.dueDate, locale) })
        : null;

  return (
    <div className="sticky bottom-0 z-10 flex items-center gap-3 border-t border-border bg-white/95 px-4 py-3 backdrop-blur md:px-8">
      {back}
      <section aria-label={t("label")} className="flex min-w-0 flex-1 flex-col items-end sm:flex-row sm:items-center sm:justify-end sm:gap-4">
        {/* Room for the item count and due date only on the widest screens: the step buttons come first. */}
        <p className="hidden truncate text-[13px] text-muted 2xl:block">
          {[t("items", { count: itemCount }), due].filter(Boolean).join(" · ")}
        </p>
        <p className="flex shrink-0 items-baseline gap-2">
          <span className="hidden whitespace-nowrap text-[13px] text-muted md:inline">{t("label")}</span>
          <span className="border border-border px-1.5 text-[11px] text-muted">{currency}</span>
          <span className="whitespace-nowrap font-serif text-xl tracking-tight text-fg tabular-nums sm:text-2xl">{total}</span>
        </p>
      </section>
      {next}
    </div>
  );
}
