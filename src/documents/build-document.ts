import type { PaymentAccountSnapshot } from "@/features/invoices/snapshots";
import { isCurrencyCode } from "@/lib/currencies";
import { formatDocDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { formatQuantity } from "@/lib/quantity";
import { DOC_LABELS, type DocLabelKey } from "./dictionary";
import type { InvoiceDocument, InvoiceDocumentSource } from "./types";

// Payment detail keys in the order they are printed, and the label each one uses.
const DETAIL_ORDER: DocLabelKey[] = [
  "bankName",
  "accountName",
  "accountNumber",
  "swift",
  "iban",
  "email",
  "instructions",
];

/** The filled-in detail lines of a payment account, in print order, labelled in the given language. */
export function paymentAccountLines(
  account: PaymentAccountSnapshot,
  labels: Record<DocLabelKey, string>,
): { key: DocLabelKey; label: string; value: string }[] {
  return DETAIL_ORDER.flatMap((key) => {
    const value = account.details[key];
    return value ? [{ key, label: labels[key], value }] : [];
  });
}

function buildPaymentAccount(
  account: PaymentAccountSnapshot,
  labels: Record<DocLabelKey, string>,
): InvoiceDocument["paymentAccounts"][number] {
  const lines = paymentAccountLines(account, labels).map(({ label, value }) => ({ label, value }));
  // Bank-like accounts already show their bank name as a line; PayPal/Wise have no such line.
  const fallbackTitle = account.type === "paypal" ? "PayPal" : account.type === "wise" ? "Wise" : "";
  return { title: account.label || fallbackTitle, lines };
}

export function buildInvoiceDocument(src: InvoiceDocumentSource): InvoiceDocument {
  const { language } = src;
  const labels = DOC_LABELS[language];
  const currency = isCurrencyCode(src.currency) ? src.currency : "IDR";
  const money = (minor: number) => formatMoney(minor, currency, language);

  // percent discounts are stored in basis points: 1250 -> "12,5%"
  const discountLabel =
    src.discountType === "percent"
      ? `${labels.discount} (${formatQuantity(src.discountValue * 10, language)}%)`
      : labels.discount;

  return {
    labels,
    number: src.number,
    issueDate: formatDocDate(src.issueDate, language),
    dueDate: src.dueDate === src.issueDate ? labels.dueOnReceipt : formatDocDate(src.dueDate, language),
    business: src.business,
    client: src.client,
    items: src.items.map((item) => ({
      name: item.name,
      description: item.description ?? "",
      quantity: formatQuantity(item.quantityMilli, language),
      unit: item.unit ?? "",
      unitPrice: money(item.unitPriceMinor),
      amount: money(item.amountMinor),
    })),
    subtotal: money(src.subtotalMinor),
    discount: src.discountMinor > 0 ? money(src.discountMinor) : null,
    discountLabel,
    total: money(src.totalMinor),
    paymentAccounts: src.paymentAccounts.map((account) => buildPaymentAccount(account, labels)),
    notes: src.notes ?? "",
    paid: src.status === "paid",
    accentColor: src.accentColor,
    template: src.template,
    language,
  };
}
