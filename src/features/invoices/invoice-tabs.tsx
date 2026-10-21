import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { INVOICE_TABS, type InvoiceTab } from "./queries";

/** Status tabs of the invoice list, each with its count; the search term is kept when switching. */
export function InvoiceTabs({
  active,
  counts,
  q,
}: {
  active: InvoiceTab;
  counts: Record<InvoiceTab, number>;
  q: string;
}) {
  const t = useTranslations("invoices.tabs");

  return (
    <nav aria-label={t("label")} className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
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
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
              current ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {t(tab)}
            <span className="rounded-full bg-badge-neutral-bg px-1.5 text-xs tabular-nums text-badge-neutral-fg">
              {counts[tab]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
