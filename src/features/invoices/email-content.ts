import type { Locale } from "@/i18n/config";
import { emailTranslator } from "@/emails/translator";

export type InvoiceEmailFacts = {
  number: string;
  language: Locale;
  businessName: string;
  clientName: string;
  /** The total already formatted for the invoice's currency and language. */
  total: string;
  /** The due date already formatted for the invoice's language. */
  dueDate: string;
};

/** The suggested subject and message of an invoice email, in the invoice's language. */
export function defaultInvoiceEmail(inv: InvoiceEmailFacts): { subject: string; message: string } {
  const t = emailTranslator(inv.language);
  const values = {
    number: inv.number,
    businessName: inv.businessName,
    clientName: inv.clientName,
    total: inv.total,
    dueDate: inv.dueDate,
  };
  return { subject: t("defaultInvoice.subject", values), message: t("defaultInvoice.message", values) };
}
