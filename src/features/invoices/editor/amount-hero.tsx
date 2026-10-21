"use client";

import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { isCurrencyCode } from "@/lib/currencies";
import { formatDocDate, isIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { EditorEvaluation, EditorState } from "../editor-state";

/**
 * The invoice total as the page's headline figure, with its currency and due date underneath —
 * the first thing to check before sending.
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
    <section aria-label={t("label")} className="rounded-card bg-subtle px-5 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-fg">{t("label")}</p>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-fg">
          <span aria-hidden className="size-2 rounded-full bg-primary" />
          {currency}
        </span>
      </div>
      <p className="mt-2 break-all text-4xl font-black tracking-tight text-accent tabular-nums sm:text-5xl">{total}</p>
      <p className="mt-2 text-sm text-muted">
        {[t("items", { count: itemCount }), due].filter(Boolean).join(" · ")}
      </p>
    </section>
  );
}
