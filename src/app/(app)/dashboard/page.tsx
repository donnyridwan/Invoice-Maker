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
  const checklistDone = checklist.profileComplete && checklist.hasPaymentAccount && checklist.hasSentInvoice;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={t("greeting", { name: firstName })}
        description={t("description")}
        actions={<NewInvoiceButton />}
        className="mb-0"
      />
      {summary.pendingClaims > 0 || summary.recurringDrafts > 0 ? (
        <div className="flex flex-col gap-2">
          {summary.pendingClaims > 0 ? (
            <div
              role="status"
              className="flex flex-wrap items-center gap-3 border border-[#f3dfb7] bg-badge-warning-bg px-4 py-3 text-sm text-badge-warning-fg"
            >
              <Clock className="size-4 shrink-0" aria-hidden />
              <span>{t("claimsBanner", { count: summary.pendingClaims })}</span>
              <Link href="/invoices?tab=unpaid" className="ml-auto underline underline-offset-4">
                {t("claimsBannerAction")}
              </Link>
            </div>
          ) : null}
          {summary.recurringDrafts > 0 ? (
            <div
              role="status"
              data-testid="recurring-drafts-banner"
              className="flex flex-wrap items-center gap-3 border border-[#d3e0fa] bg-badge-info-bg px-4 py-3 text-sm text-badge-info-fg"
            >
              <Repeat className="size-4 shrink-0" aria-hidden />
              <span>{t("recurringBanner", { count: summary.recurringDrafts })}</span>
              <Link href="/invoices?tab=draft" className="ml-auto underline underline-offset-4">
                {t("recurringBannerAction")}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
      <SummaryCards summary={summary} />
      <div className={checklistDone ? "grid gap-8" : "grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]"}>
        <RecentInvoices invoices={recent} today={today} />
        <Checklist state={checklist} />
      </div>
    </div>
  );
}
