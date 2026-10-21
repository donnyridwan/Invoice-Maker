import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InvoiceTable } from "@/features/invoices/invoice-table";
import type { Invoice } from "@/features/invoices/queries";

/** The latest invoices, as the list table, with a link to the full list. */
export function RecentInvoices({ invoices, today }: { invoices: Invoice[]; today: string }) {
  const t = useTranslations("dashboard");

  return (
    <Card role="region" aria-labelledby="recent-invoices-title">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle id="recent-invoices-title">{t("recent.title")}</CardTitle>
        {invoices.length > 0 ? (
          <Link href="/invoices" className="text-sm font-medium text-accent hover:underline">
            {t("recent.viewAll")}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent>
        {invoices.length > 0 ? (
          <InvoiceTable invoices={invoices} today={today} />
        ) : (
          <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
        )}
      </CardContent>
    </Card>
  );
}
