import { Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { InvoiceTable } from "@/features/invoices/invoice-table";
import { NewInvoiceButton } from "@/features/invoices/new-invoice-button";
import { listInvoices } from "@/features/invoices/queries";
import { firstParam } from "@/lib/search-params";
import { requireUser } from "@/lib/session";

export default async function InvoicesPage({ searchParams }: PageProps<"/invoices">) {
  const user = await requireUser();
  const t = await getTranslations("invoices");
  const params = await searchParams;
  const q = firstParam(params.q)?.trim() ?? "";

  const invoices = await listInvoices(user.id, { search: q });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<NewInvoiceButton />} />

      <form action="/invoices" method="get" role="search" className="relative mb-4 w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          name="q"
          type="search"
          defaultValue={q}
          aria-label={t("searchLabel")}
          placeholder={t("searchPlaceholder")}
          className="pl-9"
        />
      </form>

      {invoices.length > 0 ? (
        <InvoiceTable invoices={invoices} />
      ) : q ? (
        <EmptyState title={t("noResultsTitle")} description={t("noResultsDescription")} />
      ) : (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
          action={<NewInvoiceButton variant="secondary" />}
        />
      )}
    </>
  );
}
