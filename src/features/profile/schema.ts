import { z } from "zod";
import {
  currencyCode,
  integerInRange,
  optionalEmail,
  optionalText,
  requiredText,
} from "@/lib/zod-helpers";

export const TEMPLATES = ["highlight", "line", "card"] as const;
/** The template a new profile (and an invoice with an unknown template) gets. */
export const DEFAULT_TEMPLATE = "highlight";
/** The accent each template is designed around; picking a template applies it. */
export const TEMPLATE_ACCENTS = { highlight: "#E3FA7D", line: "#ED1B99", card: "#E87117" } as const;
/** The accent a profile starts with: new invoices then take their template's own accent. */
export const DEFAULT_ACCENT = "#111111";
export const INVOICE_LANGUAGES = ["id", "en"] as const;

export type Template = (typeof TEMPLATES)[number];
export type InvoiceLanguage = (typeof INVOICE_LANGUAGES)[number];

export const profileSchema = z.object({
  businessName: requiredText(200),
  email: optionalEmail,
  phone: optionalText(50),
  address: optionalText(2000),
  taxId: optionalText(50),
  baseCurrency: currencyCode,
  defaultCurrency: currencyCode,
});

export const invoiceDefaultsSchema = z.object({
  invoicePrefix: z
    .string("required")
    .trim()
    .max(20, "tooLong:20")
    .regex(/^[A-Za-z0-9/._-]*$/, "invalidPrefix"),
  defaultDueDays: integerInRange(0, 365),
  defaultLanguage: z.enum(INVOICE_LANGUAGES, "invalidValue"),
  defaultNotes: optionalText(2000),
  defaultTemplate: z.enum(TEMPLATES, "invalidValue"),
  accentColor: z
    .string("required")
    .regex(/^#[0-9A-Fa-f]{6}$/, "invalidColor"),
});

export type ProfileInput = z.output<typeof profileSchema>;
export type InvoiceDefaultsInput = z.output<typeof invoiceDefaultsSchema>;
