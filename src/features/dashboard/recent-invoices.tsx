import Link from "next/link";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoiceTable } from "@/features/invoices/invoice-table";
import type { Invoice } from "@/features/invoices/queries";

/** The latest invoices, as the list table, with a link to the full list. */
export function RecentInvoices({ invoices, today }: { invoices: Invoice[]; today: string }) {
  const t = useTranslations("dashboard");

  return (
    <section aria-labelledby="recent-invoices-title" className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="recent-invoices-title" className="text-base font-semibold tracking-tight text-fg">
          {t("recent.title")}
        </h2>
        {invoices.length > 0 ? (
          <Link href="/invoices" className="text-[13px] font-medium text-muted hover:text-fg">
            {t("recent.viewAll")}
          </Link>
        ) : null}
      </div>
      {invoices.length > 0 ? (
        <InvoiceTable invoices={invoices} today={today} />
      ) : (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      )}
    </section>
  );
}
