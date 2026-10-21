import Link from "next/link";
import { Clock, Repeat } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { getDashboardSummary } from "@/features/dashboard/queries";
import { RecentInvoices } from "@/features/dashboard/recent-invoices";
import { SummaryCards } from "@/features/dashboard/summary-cards";
import { NewInvoiceButton } from "@/features/invoices/new-invoice-button";
import { listInvoices } from "@/features/invoices/queries";
import { Checklist } from "@/features/profile/checklist";
import { getChecklist } from "@/features/profile/queries";
import { todayInJakarta } from "@/lib/dates";
import { requireUser } from "@/lib/session";

export default async function DashboardPage() {
  const user = await requireUser();
  const t = await getTranslations("dashboard");
  const today = todayInJakarta();
  const [checklist, summary, recent] = await Promise.all([
    getChecklist(user.id),
    getDashboardSummary(user.id, today),
    listInvoices(user.id, { limit: 5 }),
  ]);
  const firstName = user.name.trim().split(/\s+/)[0] || user.email;

  return (
    <>
      <PageHeader
        title={t("greeting", { name: firstName })}
        description={t("description")}
        actions={<NewInvoiceButton />}
      />
      <div className="flex flex-col gap-6">
        {summary.pendingClaims > 0 ? (
          <div
            role="status"
            className="flex flex-wrap items-center gap-3 rounded-md border border-badge-warning-fg/20 bg-badge-warning-bg px-4 py-3 text-sm text-badge-warning-fg"
          >
            <Clock className="size-4 shrink-0" aria-hidden />
            <span className="font-medium">{t("claimsBanner", { count: summary.pendingClaims })}</span>
            <Link href="/invoices?tab=unpaid" className="ml-auto font-medium underline underline-offset-2">
              {t("claimsBannerAction")}
            </Link>
          </div>
        ) : null}
        {summary.recurringDrafts > 0 ? (
          <div
            role="status"
            data-testid="recurring-drafts-banner"
            className="flex flex-wrap items-center gap-3 rounded-md border border-badge-info-fg/20 bg-badge-info-bg px-4 py-3 text-sm text-badge-info-fg"
          >
            <Repeat className="size-4 shrink-0" aria-hidden />
            <span className="font-medium">{t("recurringBanner", { count: summary.recurringDrafts })}</span>
            <Link href="/invoices?tab=draft" className="ml-auto font-medium underline underline-offset-2">
              {t("recurringBannerAction")}
            </Link>
          </div>
        ) : null}
        <SummaryCards summary={summary} />
        <Checklist state={checklist} />
        <RecentInvoices invoices={recent} today={today} />
      </div>
    </>
  );
}
