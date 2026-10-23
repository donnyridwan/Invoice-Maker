import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { INVOICE_TABS, type InvoiceTab } from "./queries";

const TAB_LINK_CLASS =
  "-mb-px inline-flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent";

/**
 * Status tabs of the invoice list, each with its count; the search term is kept when switching.
 * "Berulang" is the last tab: it leads to the recurring schedules, a page of its own.
 */
export function InvoiceTabs({
  active,
  counts,
  q,
  recurringCount,
}: {
  active: InvoiceTab | "recurring";
  counts: Record<InvoiceTab, number>;
  q: string;
  recurringCount: number;
}) {
  const t = useTranslations("invoices.tabs");

  return (
    <nav aria-label={t("label")} className="mb-4 flex overflow-x-auto border-b border-border">
      {INVOICE_TABS.map((tab) => {
        const params = new URLSearchParams();
        if (tab !== "all") params.set("tab", tab);
        if (q) params.set("q", q);
        const query = params.toString();
        const current = tab === active;
        return (
          <Link
            key={tab}
            href={query ? `/invoices?${query}` : "/invoices"}
            aria-current={current ? "page" : undefined}
            className={cn(TAB_LINK_CLASS, current ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg")}
          >
            {t(tab)}
            <span className="rounded-md bg-subtle px-1.5 text-[11px] tabular-nums text-muted">
              {counts[tab]}
            </span>
          </Link>
        );
      })}
      <Link
        href="/invoices/recurring"
        aria-current={active === "recurring" ? "page" : undefined}
        className={cn(TAB_LINK_CLASS, active === "recurring" ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg")}
      >
        {t("recurring")}
        <span className="rounded-md bg-subtle px-1.5 text-[11px] tabular-nums text-muted">
          {recurringCount}
        </span>
      </Link>
    </nav>
  );
}
