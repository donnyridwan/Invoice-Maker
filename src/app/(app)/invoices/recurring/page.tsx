import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { InvoiceTabs } from "@/features/invoices/invoice-tabs";
import { NewInvoiceButton } from "@/features/invoices/new-invoice-button";
import { countInvoicesByTab } from "@/features/invoices/queries";
import { listSchedules } from "@/features/recurring/queries";
import { ScheduleTable } from "@/features/recurring/schedule-table";
import { requireUser } from "@/lib/session";

/** The "Berulang" tab of the invoice list: every recurring schedule of the user. */
export default async function RecurringInvoicesPage() {
  const user = await requireUser();
  const t = await getTranslations("invoices");
  const tRecurring = await getTranslations("recurring.list");
  const [schedules, counts] = await Promise.all([listSchedules(user.id), countInvoicesByTab(user.id)]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={<NewInvoiceButton />} />
      <InvoiceTabs active="recurring" counts={counts} q="" recurringCount={schedules.length} />
      {schedules.length > 0 ? (
        <ScheduleTable schedules={schedules} />
      ) : (
        <EmptyState title={tRecurring("emptyTitle")} description={tRecurring("emptyDescription")} />
      )}
    </>
  );
}
