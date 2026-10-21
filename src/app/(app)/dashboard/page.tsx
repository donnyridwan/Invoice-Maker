import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { NewInvoiceButton } from "@/features/invoices/new-invoice-button";
import { Checklist } from "@/features/profile/checklist";
import { getChecklist } from "@/features/profile/queries";
import { requireUser } from "@/lib/session";

export default async function DashboardPage() {
  const user = await requireUser();
  const t = await getTranslations("dashboard");
  const checklist = await getChecklist(user.id);
  const firstName = user.name.trim().split(/\s+/)[0] || user.email;

  return (
    <>
      <PageHeader
        title={t("greeting", { name: firstName })}
        description={t("description")}
        actions={<NewInvoiceButton />}
      />
      <div className="flex flex-col gap-6">
        <Checklist state={checklist} />
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      </div>
    </>
  );
}
