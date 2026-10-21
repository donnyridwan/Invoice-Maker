import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isCurrencyCode } from "@/lib/currencies";
import { formatDocDate } from "@/lib/dates";
import { resolveLocale } from "@/i18n/config";
import { formatMoney } from "@/lib/money";
import type { Invoice } from "./queries";
import { StatusBadge } from "./status-badge";

export function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  const t = useTranslations("invoices");
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
          return (
            // The number link stretches over the whole row, so the entire row is clickable.
            <TableRow key={invoice.id} className="relative">
              <TableCell>
                <Link
                  href={`/invoices/${invoice.id}/edit`}
                  className="font-medium text-fg after:absolute after:inset-0 hover:text-accent"
                >
                  {invoice.number}
                </Link>
              </TableCell>
              <TableCell className={invoice.clientSnapshot ? undefined : "text-muted"}>
                {invoice.clientSnapshot?.name ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted">{formatDocDate(invoice.issueDate, locale)}</TableCell>
              <TableCell className="whitespace-nowrap text-muted">{formatDocDate(invoice.dueDate, locale)}</TableCell>
              <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                {formatMoney(invoice.totalMinor, currency, locale)}
              </TableCell>
              <TableCell>
                <StatusBadge status={invoice.status} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
