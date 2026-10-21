import type { InvoiceDocumentSource } from "@/documents/types";
import { INVOICE_LANGUAGES, TEMPLATES, type InvoiceLanguage, type Template } from "@/features/profile/schema";
import type { DiscountType } from "@/lib/invoice-calc";
import type { InvoiceWithItems } from "./queries";

function oneOf<T extends string>(allowed: readonly T[], value: string, fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

/** The data to render a stored invoice as a document (public page, later PDF / print). */
export function documentSourceFromInvoice(invoice: InvoiceWithItems): InvoiceDocumentSource {
  return {
    number: invoice.number,
    status: invoice.status,
    language: oneOf<InvoiceLanguage>(INVOICE_LANGUAGES, invoice.language, "id"),
    template: oneOf<Template>(TEMPLATES, invoice.template, "minimal"),
    accentColor: invoice.accentColor,
    currency: invoice.currency,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    business: invoice.businessSnapshot,
    client: invoice.clientSnapshot,
    paymentAccounts: invoice.paymentAccountsSnapshot,
    items: invoice.items,
    subtotalMinor: invoice.subtotalMinor,
    discountType: oneOf<DiscountType>(["none", "percent", "fixed"], invoice.discountType, "none"),
    discountValue: invoice.discountValue,
    discountMinor: invoice.discountMinor,
    totalMinor: invoice.totalMinor,
    notes: invoice.notes,
  };
}
