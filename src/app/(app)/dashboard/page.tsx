import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/session";

export default async function DashboardPage() {
  const user = await requireUser();
  const t = await getTranslations("dashboard");
  const firstName = user.name.trim().split(/\s+/)[0] || user.email;

  return (
    <>
      <PageHeader title={t("greeting", { name: firstName })} description={t("description")} />
      <div className="flex flex-col gap-6">
        {/* Task 8 mounts the "Get started" checklist here. */}
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      </div>
    </>
  );
}
