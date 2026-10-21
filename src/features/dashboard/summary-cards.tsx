import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { resolveLocale } from "@/i18n/config";
import type { CurrencyCode } from "@/lib/currencies";
import { formatMoney, formatMoneyInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CurrencyTotals, DashboardSummary } from "./queries";

type CardSpec = {
  key: "unpaid" | "overdue" | "paidThisMonth";
  totals: CurrencyTotals;
  href: string;
  /** The big number turns red when there is something to chase. */
  alert?: boolean;
};

/**
 * Three cards: unpaid, overdue and paid this month. The big number is the total in the base
 * currency (0 when there is none); other currencies follow as small "+ USD 1,250.00" lines and
 * the invoice count (all currencies) sits underneath. Each card links to the matching list tab.
 */
export function SummaryCards({ summary, baseCurrency }: { summary: DashboardSummary; baseCurrency: CurrencyCode }) {
  const t = useTranslations("dashboard.summary");
  const locale = resolveLocale(useLocale());

  const cards: CardSpec[] = [
    { key: "unpaid", totals: summary.unpaid, href: "/invoices?tab=unpaid" },
    { key: "overdue", totals: summary.overdue, href: "/invoices?tab=unpaid", alert: true },
    { key: "paidThisMonth", totals: summary.paidThisMonth, href: "/invoices?tab=paid" },
  ];

  return (
    <section aria-label={t("label")} className="grid gap-4 sm:grid-cols-3">
      {cards.map(({ key, totals, href, alert }) => {
        const base = totals.find((row) => row.currency === baseCurrency);
        const others = totals.filter((row) => row.currency !== baseCurrency);
        const count = totals.reduce((sum, row) => sum + row.count, 0);
        return (
          <Link
            key={key}
            href={href}
            className="block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Card className="h-full p-5 transition-colors hover:bg-subtle/60">
              <p className="text-sm text-muted">{t(key)}</p>
              <p
                className={cn(
                  "mt-1 text-2xl font-semibold tabular-nums tracking-tight",
                  alert && (base?.totalMinor ?? 0) > 0 ? "text-danger" : "text-fg",
                )}
              >
                {formatMoney(base?.totalMinor ?? 0, baseCurrency, locale)}
              </p>
              {others.map((row) => (
                <p key={row.currency} className="text-sm tabular-nums text-muted">
                  + {row.currency} {formatMoneyInput(row.totalMinor, row.currency, locale)}
                </p>
              ))}
              <p className="mt-2 text-xs text-muted">{t("count", { count })}</p>
            </Card>
          </Link>
        );
      })}
    </section>
  );
}
