import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isCurrencyCode } from "@/lib/currencies";
import { formatDocDate } from "@/lib/dates";
import { resolveLocale } from "@/i18n/config";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { displayStatus, dueRelative } from "./display-status";
import type { Invoice } from "./queries";
import { StatusBadge } from "./status-badge";

/** `today` is the Asia/Jakarta date (YYYY-MM-DD) the derived status is computed on. */
export function InvoiceTable({ invoices, today }: { invoices: Invoice[]; today: string }) {
  const t = useTranslations("invoices");
  const tDue = useTranslations("invoices.detail.due");
  const locale = resolveLocale(useLocale());

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{t("colNumber")}</TableHead>
          <TableHead>{t("colClient")}</TableHead>
          <TableHead>{t("colIssueDate")}</TableHead>
          <TableHead>{t("colDueDate")}</TableHead>
          <TableHead className="text-right">{t("colAmount")}</TableHead>
          <TableHead>{t("colStatus")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => {
          const currency = isCurrencyCode(invoice.currency) ? invoice.currency : "IDR";
          const status = displayStatus(invoice, today);
          // How far the due date is: only meaningful while the invoice is still unpaid.
          const relative = invoice.status === "sent" || invoice.status === "payment_claimed" ? dueRelative(invoice.dueDate, today) : null;
          return (
            // The number link stretches over the whole row, so the entire row is clickable.
            <TableRow key={invoice.id} className="relative">
              <TableCell>
                <Link
                  href={invoice.status === "draft" ? `/invoices/${invoice.id}/edit` : `/invoices/${invoice.id}`}
                  className="font-medium text-fg after:absolute after:inset-0 hover:text-accent"
                >
                  {invoice.number}
                </Link>
                {invoice.status === "payment_claimed" ? (
                  <Badge variant="warning" className="ml-2 px-1.5 py-0 text-[11px]">
                    {t("needsConfirmation")}
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className={invoice.clientSnapshot ? undefined : "text-muted"}>
                {invoice.clientSnapshot?.name ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted">{formatDocDate(invoice.issueDate, locale)}</TableCell>
              <TableCell className="whitespace-nowrap text-muted">
                {formatDocDate(invoice.dueDate, locale)}
                {relative ? (
                  <span className={cn("block text-xs", status === "overdue" ? "font-medium text-danger" : "text-muted")}>
                    {relative.kind === "today"
                      ? tDue("today")
                      : relative.kind === "inDays"
                        ? tDue("inDays", { days: relative.days })
                        : tDue("overdueDays", { days: relative.days })}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                {formatMoney(invoice.totalMinor, currency, locale)}
              </TableCell>
              <TableCell>
                <StatusBadge status={status} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
