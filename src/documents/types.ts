import type { BusinessSnapshot, ClientSnapshot, PaymentAccountSnapshot } from "@/features/invoices/snapshots";
import type { InvoiceLanguage, Template } from "@/features/profile/schema";
import type { DiscountType } from "@/lib/invoice-calc";
import type { DocLabelKey } from "./dictionary";

/** Raw invoice data (as stored) that is enough to render a document. */
export type InvoiceDocumentSource = {
  number: string;
  status: string;
  language: InvoiceLanguage;
  template: Template;
  accentColor: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  business: BusinessSnapshot;
  client: ClientSnapshot | null;
  paymentAccounts: PaymentAccountSnapshot[];
  items: {
    name: string;
    description?: string | null;
    quantityMilli: number;
    unit?: string | null;
    unitPriceMinor: number;
    amountMinor: number;
  }[];
  subtotalMinor: number;
  discountType: DiscountType;
  discountValue: number;
  discountMinor: number;
  totalMinor: number;
  notes?: string | null;
};

/** Everything a template needs, already formatted for display in the invoice language. */
export type InvoiceDocument = {
  labels: Record<DocLabelKey, string>;
  number: string;
  issueDate: string;
  dueDate: string;
  business: BusinessSnapshot;
  client: ClientSnapshot | null;
  items: { name: string; description: string; quantity: string; unit: string; unitPrice: string; amount: string }[];
  subtotal: string;
  /** Formatted discount amount, `null` when there is no discount. */
  discount: string | null;
  discountLabel: string;
  total: string;
  /** ISO currency code of the amounts, e.g. "IDR". */
  currency: string;
  paymentAccounts: { title: string; lines: { label: string; value: string }[] }[];
  notes: string;
  paid: boolean;
  accentColor: string;
  template: Template;
  language: InvoiceLanguage;
};
