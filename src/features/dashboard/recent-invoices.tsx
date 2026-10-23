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
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="recent-invoices-title" className="font-serif text-lg text-fg">
          {t("recent.title")}
        </h2>
        {invoices.length > 0 ? (
          <Link href="/invoices" className="text-[13px] text-muted underline-offset-4 hover:text-fg hover:underline">
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
