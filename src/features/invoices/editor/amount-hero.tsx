"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import { isCurrencyCode } from "@/lib/currencies";
import { formatMoney } from "@/lib/money";
import type { EditorEvaluation, EditorState } from "../editor-state";

/**
 * The bar pinned to the bottom of the form: the invoice total with its currency — the first thing
 * to check before sending, always in view while editing — between the step buttons (`back` on the
 * left, `next` on the right).
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

  return (
    <div className="sticky bottom-0 z-10 border-t border-border bg-white/95 backdrop-blur">
      {/* Lined up with the form column above. */}
      <div className="mx-auto flex w-full max-w-[640px] items-center gap-3 px-4 py-3 md:px-8">
        {back}
        <section aria-label={t("label")} className="flex min-w-0 flex-1 items-baseline justify-end gap-2">
          <span className="border border-border px-1.5 text-[11px] text-muted">{currency}</span>
          <span className="whitespace-nowrap font-serif text-xl tracking-tight text-fg tabular-nums sm:text-2xl">{total}</span>
        </section>
        {next}
      </div>
    </div>
  );
}
