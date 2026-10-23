"use client";

import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { isCurrencyCode } from "@/lib/currencies";
import { formatDocDate, isIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { EditorEvaluation, EditorState } from "../editor-state";

/**
 * The bar pinned to the bottom of the form: the invoice total with its currency, item count and due
 * date — the first thing to check before sending, always in view while editing.
 */
export function AmountHero({
  state,
  evaluation,
  locale,
}: {
  state: EditorState;
  evaluation: EditorEvaluation;
  locale: Locale;
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
    <section
      aria-label={t("label")}
      className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-white/95 px-4 py-3 backdrop-blur md:px-8"
    >
      <p className="text-[13px] text-muted">
        {[t("items", { count: itemCount }), due].filter(Boolean).join(" · ")}
      </p>
      <p className="flex items-baseline gap-2">
        <span className="text-[13px] text-muted">{t("label")}</span>
        <span className="border border-border px-1.5 text-[11px] text-muted">{currency}</span>
        <span className="break-all font-serif text-2xl tracking-tight text-fg tabular-nums">{total}</span>
      </p>
    </section>
  );
}
