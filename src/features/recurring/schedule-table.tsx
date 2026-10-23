import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { resolveLocale } from "@/i18n/config";
import { isCurrencyCode } from "@/lib/currencies";
import { formatDocDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { ScheduleRow } from "./queries";
import { everyLabel, type RecurringT } from "./schedule-summary";

const STATUS_VARIANT = { active: "success", paused: "warning", stopped: "danger", finished: "neutral" } as const;

/** The recurring schedules of the user: source invoice, client, amount, frequency, next run and status. */
export function ScheduleTable({ schedules }: { schedules: ScheduleRow[] }) {
  const t = useTranslations("recurring");
  const locale = resolveLocale(useLocale());

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{t("list.colSource")}</TableHead>
          <TableHead>{t("list.colClient")}</TableHead>
          <TableHead className="text-right">{t("list.colAmount")}</TableHead>
          <TableHead>{t("list.colFrequency")}</TableHead>
          <TableHead>{t("list.colNext")}</TableHead>
          <TableHead>{t("list.colStatus")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {schedules.map((schedule) => {
          const currency = schedule.currency && isCurrencyCode(schedule.currency) ? schedule.currency : null;
          return (
            // The source link stretches over the whole row, so the entire row is clickable.
            <TableRow key={schedule.id} className="relative">
              <TableCell>
                <span className="inline-flex items-center gap-3">
                  {schedule.sourceInvoiceId ? (
                    <Link
                      href={`/invoices/${schedule.sourceInvoiceId}`}
                      className="whitespace-nowrap font-medium text-fg after:absolute after:inset-0 hover:text-accent"
                    >
                      {schedule.sourceNumber}
                    </Link>
                  ) : (
                    <span className="text-muted">{t("list.sourceGone")}</span>
                  )}
                </span>
              </TableCell>
              <TableCell className={schedule.clientName ? undefined : "text-muted"}>
                {schedule.clientName ? (
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={schedule.clientName} className="size-6 text-[9px]" />
                    {schedule.clientName}
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                {currency && schedule.totalMinor !== null ? formatMoney(schedule.totalMinor, currency, locale) : "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {everyLabel(t as unknown as RecurringT, schedule.frequency, schedule.interval)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted">
                {schedule.status === "finished" || schedule.status === "stopped" ? "—" : formatDocDate(schedule.nextRunOn, locale)}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[schedule.status]}>{t(`status.${schedule.status}`)}</Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
