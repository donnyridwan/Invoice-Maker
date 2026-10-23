import Link from "next/link";
import { Clock, Repeat } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getDashboardSummary } from "@/features/dashboard/queries";
import { QuickActions } from "@/features/dashboard/quick-actions";
import { RecentInvoices } from "@/features/dashboard/recent-invoices";
import { SummaryCards } from "@/features/dashboard/summary-cards";
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
      <div>
        <p className="text-[13px] text-muted">{t("workspace")}</p>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-fg">{t("greeting", { name: firstName })}</h1>
      </div>
      {summary.pendingClaims > 0 || summary.recurringDrafts > 0 ? (
        <div className="flex flex-col gap-2">
          {summary.pendingClaims > 0 ? (
            <div
              role="status"
              className="flex flex-wrap items-center gap-3 rounded-card border border-[#f5e2b0] bg-badge-warning-bg px-4 py-3 text-sm text-badge-warning-fg"
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
              className="flex flex-wrap items-center gap-3 rounded-card border border-[#d6e4fc] bg-badge-info-bg px-4 py-3 text-sm text-badge-info-fg"
            >
              <Repeat className="size-4 shrink-0" aria-hidden />
              <span className="font-medium">{t("recurringBanner", { count: summary.recurringDrafts })}</span>
              <Link href="/invoices?tab=draft" className="ml-auto font-medium underline underline-offset-2">
                {t("recurringBannerAction")}
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
      <QuickActions />
      <SummaryCards summary={summary} />
      <div className={checklistDone ? "grid gap-8" : "grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"}>
        <RecentInvoices invoices={recent} today={today} />
        <Checklist state={checklist} />
      </div>
    </div>
  );
}
