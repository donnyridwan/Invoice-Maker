import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { INVOICE_TABS, type InvoiceTab } from "./queries";

const TAB_LINK_CLASS =
  "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-button border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

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
    <nav aria-label={t("label")} className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
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
            className={cn(TAB_LINK_CLASS, current ? "border-accent bg-accent text-white" : "border-border bg-white text-fg hover:bg-subtle")}
          >
            {t(tab)}
            <span className="rounded-full bg-current/10 px-1.5 text-xs tabular-nums">
              {counts[tab]}
            </span>
          </Link>
        );
      })}
      <Link
        href="/invoices/recurring"
        aria-current={active === "recurring" ? "page" : undefined}
        className={cn(TAB_LINK_CLASS, active === "recurring" ? "border-accent bg-accent text-white" : "border-border bg-white text-fg hover:bg-subtle")}
      >
        {t("recurring")}
        <span className="rounded-full bg-current/10 px-1.5 text-xs tabular-nums">
          {recurringCount}
        </span>
      </Link>
    </nav>
  );
}
