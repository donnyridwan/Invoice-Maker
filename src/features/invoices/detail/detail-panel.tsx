import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleCard } from "@/features/recurring/schedule-card";
import type { ScheduleView } from "@/features/recurring/schedule-summary";
import { ClaimList, type ClaimListItem } from "@/features/payment-claims/claim-list";
import { resolveLocale } from "@/i18n/config";
import type { CurrencyCode } from "@/lib/currencies";
import { formatDocDate, todayInJakarta } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { displayStatus, dueRelative } from "../display-status";
import type { InvoiceEvent } from "../events";
import type { Invoice } from "../queries";
import { StatusBadge } from "../status-badge";
import { ActionsBar } from "./actions-bar";
import { Timeline } from "./timeline";

type Props = {
  invoice: Invoice;
  currency: CurrencyCode;
  today: string;
  now: Date;
  events: InvoiceEvent[];
  pendingClaims: ClaimListItem[];
  payerNames: Record<string, string>;
  emailEnabled: boolean;
  schedule: ScheduleView | null;
};

/** The 360px right rail of the detail page: status, actions, pending claims and the activity. */
export function DetailPanel({ invoice, currency, today, now, events, pendingClaims, payerNames, emailEnabled, schedule }: Props) {
  const t = useTranslations("invoices.detail");
  const locale = resolveLocale(useLocale());
  const status = displayStatus(invoice, today);
  const open = invoice.status === "sent" || invoice.status === "payment_claimed";

  let dueText: string | null = null;
  if (open) {
    const relative = dueRelative(invoice.dueDate, today);
    dueText =
      relative.kind === "today"
        ? t("due.today")
        : relative.kind === "inDays"
          ? t("due.inDays", { days: relative.days })
          : t("due.overdueDays", { days: relative.days });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card role="region" aria-label={t("status.label")} className="p-5">
        <StatusBadge status={status} />
        <p className="mt-3 text-xs text-muted">{t("status.total")}</p>
        <p className="text-3xl font-black tabular-nums tracking-tight text-fg">
          {formatMoney(invoice.totalMinor, currency, locale)}
        </p>
        {open ? (
          <p className="mt-2 text-sm text-muted">
            {t("status.dueOn", { date: formatDocDate(invoice.dueDate, locale) })}
            {" · "}
            <span className={status === "overdue" ? "font-medium text-danger" : undefined}>{dueText}</span>
          </p>
        ) : null}
        {invoice.status === "paid" && invoice.paidAt ? (
          <p className="mt-2 text-sm text-muted">
            {t("status.paidOn", { date: formatDocDate(todayInJakarta(invoice.paidAt), locale) })}
          </p>
        ) : null}
        {invoice.status === "paid" && invoice.paidNote ? (
          <p className="mt-1 whitespace-pre-line break-words text-sm text-muted">
            {t("status.note", { note: invoice.paidNote })}
          </p>
        ) : null}
        {invoice.status === "void" && invoice.voidedAt ? (
          <p className="mt-2 text-sm text-muted">
            {t("status.voidedOn", { date: formatDocDate(todayInJakarta(invoice.voidedAt), locale) })}
          </p>
        ) : null}
        {invoice.clientSnapshot ? (
          <p className="mt-3 border-t border-border pt-3 text-sm text-fg">
            <span className="text-muted">{t("status.client")}: </span>
            {invoice.clientSnapshot.name}
          </p>
        ) : null}
      </Card>

      <Card className="p-5">
        <ActionsBar
          invoiceId={invoice.id}
          number={invoice.number}
          status={invoice.status}
          today={today}
          publicPath={`/i/${invoice.publicToken}`}
          emailEnabled={emailEnabled}
        />
      </Card>

      {schedule || invoice.status !== "void" ? (
        <ScheduleCard invoiceId={invoice.id} number={invoice.number} schedule={schedule} />
      ) : null}

      {pendingClaims.length > 0 ? (
        <Card role="region" aria-labelledby="claims-title">
          <CardHeader>
            <CardTitle id="claims-title">{t("claims.title")}</CardTitle>
            <p className="text-sm text-muted">{t("claims.description")}</p>
          </CardHeader>
          <CardContent>
            <ClaimList claims={pendingClaims} currency={currency} />
          </CardContent>
        </Card>
      ) : null}

      <Card role="region" aria-labelledby="activity-title">
        <CardHeader>
          <CardTitle id="activity-title">{t("activity.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Timeline events={events} payerNames={payerNames} now={now} />
        </CardContent>
      </Card>
    </div>
  );
}
