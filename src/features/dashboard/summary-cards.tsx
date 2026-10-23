import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { resolveLocale } from "@/i18n/config";
import { formatDocDate } from "@/lib/dates";
import { formatMoney, formatMoneyInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { DashboardCard, DashboardSummary } from "./queries";

type CardSpec = {
  key: "unpaid" | "overdue" | "paidThisMonth";
  card: DashboardCard;
  href: string;
  /** The big number turns red when there is something to chase. */
  alert?: boolean;
};

/**
 * Three bordered figures: unpaid, overdue and paid this month. The big number is the total in the base
 * currency, other currencies converted in; it starts with "≈" (and a tooltip names the rate date)
 * when any conversion went into it. Invoices in a currency without a known rate follow as small
 * "+ USD 120.00 without rate" lines, and the invoice count (all currencies) sits underneath. Each
 * figure links to the matching list tab.
 */
export function SummaryCards({ summary }: { summary: DashboardSummary }) {
  const t = useTranslations("dashboard.summary");
  const locale = resolveLocale(useLocale());

  const cards: CardSpec[] = [
    { key: "unpaid", card: summary.unpaid, href: "/invoices?tab=unpaid" },
    { key: "overdue", card: summary.overdue, href: "/invoices?tab=unpaid", alert: true },
    { key: "paidThisMonth", card: summary.paidThisMonth, href: "/invoices?tab=paid" },
  ];

  return (
    <section aria-label={t("label")} className="grid gap-4 sm:grid-cols-3">
      {cards.map(({ key, card, href, alert }) => (
        <Link
          key={key}
          href={href}
          className="block border border-border px-5 py-4 transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <p
            title={card.converted && card.rateDate ? t("convertedAt", { date: formatDocDate(card.rateDate, locale) }) : undefined}
            className={cn(
              "font-serif text-[26px] leading-tight tabular-nums tracking-tight",
              alert && card.totalBaseMinor > 0 ? "text-danger" : "text-fg",
            )}
          >
            {card.converted ? "≈ " : ""}
            {formatMoney(card.totalBaseMinor, card.baseCurrency, locale)}
          </p>
          <p className="mt-2 text-sm text-fg">{t(key)}</p>
          {card.withoutRate.map((row) => (
            <p key={row.currency} className="text-sm tabular-nums text-muted">
              + {row.currency} {formatMoneyInput(row.totalMinor, row.currency, locale)} {t("withoutRate")}
            </p>
          ))}
          <p className="mt-0.5 text-[13px] text-muted">{t("count", { count: card.count })}</p>
        </Link>
      ))}
    </section>
  );
}
