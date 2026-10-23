import Link from "next/link";
import { FileText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Avatar, IconTile } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { displayStatus } from "@/features/invoices/display-status";
import type { Invoice } from "@/features/invoices/queries";
import { StatusBadge } from "@/features/invoices/status-badge";
import { resolveLocale } from "@/i18n/config";
import { isCurrencyCode } from "@/lib/currencies";
import { formatDocDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

/**
 * The latest invoices as a list: the client's avatar, who and which invoice, the amount and the
 * status; each row opens the invoice. A link leads to the full list.
 */
export function RecentInvoices({ invoices, today }: { invoices: Invoice[]; today: string }) {
  const t = useTranslations();
  const locale = resolveLocale(useLocale());

  return (
    <section aria-labelledby="recent-invoices-title" className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="recent-invoices-title" className="text-base font-semibold tracking-tight text-fg">
          {t("dashboard.recent.title")}
        </h2>
        {invoices.length > 0 ? (
          <Link href="/invoices" className="text-[13px] font-medium text-muted hover:text-fg">
            {t("dashboard.recent.viewAll")}
          </Link>
        ) : null}
      </div>
      {invoices.length > 0 ? (
        <ul className="flex flex-col">
          {invoices.map((invoice) => {
            const currency = isCurrencyCode(invoice.currency) ? invoice.currency : "IDR";
            const client = invoice.clientSnapshot?.name;
            return (
              <li key={invoice.id}>
                <Link
                  href={invoice.status === "draft" ? `/invoices/${invoice.id}/edit` : `/invoices/${invoice.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {client ? <Avatar name={client} className="size-9" /> : <IconTile icon={FileText} className="size-9" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-fg">{client ?? t("invoices.noClient")}</span>
                    <span className="block truncate text-[13px] text-muted">
                      {invoice.number} · {t("invoices.detail.status.dueOn", { date: formatDocDate(invoice.dueDate, locale) })}
                    </span>
                  </span>
                  <span className="hidden whitespace-nowrap font-medium tabular-nums text-fg sm:inline">
                    {formatMoney(invoice.totalMinor, currency, locale)}
                  </span>
                  <StatusBadge status={displayStatus(invoice, today)} className="shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title={t("dashboard.emptyTitle")} description={t("dashboard.emptyDescription")} />
      )}
    </section>
  );
}
