import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isCurrencyCode } from "@/lib/currencies";
import { formatDocDate } from "@/lib/dates";
import { resolveLocale } from "@/i18n/config";
import { formatMoney } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { displayStatus } from "./display-status";
import { InvoiceRowMenu } from "./invoice-row-menu";
import type { Invoice } from "./queries";
import { StatusBadge } from "./status-badge";

/** `today` is the Asia/Jakarta date (YYYY-MM-DD) the derived status is computed on. */
export function InvoiceTable({ invoices, today }: { invoices: Invoice[]; today: string }) {
  const t = useTranslations("invoices");
  const tAll = useTranslations();
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
          <TableHead className="w-12">
            <span className="sr-only">{tAll("common.actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => {
          const currency = isCurrencyCode(invoice.currency) ? invoice.currency : "IDR";
          const status = displayStatus(invoice, today);
          return (
            // The number link stretches over the whole row, so the entire row is clickable.
            <TableRow key={invoice.id} className="relative">
              <TableCell>
                <span className="inline-flex items-center gap-3">
                  <Link
                    href={invoice.status === "draft" ? `/invoices/${invoice.id}/edit` : `/invoices/${invoice.id}`}
                    className="whitespace-nowrap font-medium text-fg after:absolute after:inset-0 hover:text-accent"
                  >
                    {invoice.number}
                  </Link>
                </span>
                {invoice.status === "payment_claimed" ? (
                  <Badge variant="warning" className="ml-2 px-1.5 py-0 text-[11px]">
                    {t("needsConfirmation")}
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className={invoice.clientSnapshot ? undefined : "text-muted"}>
                {invoice.clientSnapshot ? (
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={invoice.clientSnapshot.name} className="size-6 text-[9px]" />
                    {invoice.clientSnapshot.name}
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted">{formatDocDate(invoice.issueDate, locale)}</TableCell>
              <TableCell className="whitespace-nowrap text-muted">{formatDocDate(invoice.dueDate, locale)}</TableCell>
              <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                {formatMoney(invoice.totalMinor, currency, locale)}
              </TableCell>
              <TableCell>
                <StatusBadge status={status} />
              </TableCell>
              <TableCell className="px-2 text-center">
                <InvoiceRowMenu invoice={invoice} today={today} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
