import { z } from "zod";
import { TEMPLATES, INVOICE_LANGUAGES } from "@/features/profile/schema";
import { isIsoDate } from "@/lib/dates";
import { INVOICE_NUMBER_RE } from "@/lib/numbering";
import { MAX_QUANTITY_MILLI } from "@/lib/quantity";
import { UUID_RE } from "@/lib/validate";
import { currencyCode, integerInRange, optionalText } from "@/lib/zod-helpers";

export const DISCOUNT_TYPES = ["none", "percent", "fixed"] as const;
export const MAX_ITEMS = 100;
export const MAX_PAYMENT_ACCOUNTS = 10;
/** 100% in basis points. */
export const MAX_PERCENT_BP = 10_000;

const isoDate = z.string("required").refine(isIsoDate, "invalidDate");

const itemSchema = z.object({
  // A draft may contain blank rows, so the name can be empty.
  name: z.string("required").trim().max(200, "tooLong:200"),
  description: optionalText(2000),
  quantityMilli: integerInRange(1, MAX_QUANTITY_MILLI),
  unit: optionalText(30),
  unitPriceMinor: integerInRange(0, Number.MAX_SAFE_INTEGER),
});

export const invoiceDraftSchema = z
  .object({
    clientId: z.string().regex(UUID_RE, "invalidValue").nullable(),
    number: z.string("required").trim().regex(INVOICE_NUMBER_RE, "invalidNumber"),
    issueDate: isoDate,
    dueDate: isoDate,
    currency: currencyCode,
    language: z.enum(INVOICE_LANGUAGES, "invalidValue"),
    template: z.enum(TEMPLATES, "invalidValue"),
    accentColor: z.string("required").regex(/^#[0-9A-Fa-f]{6}$/, "invalidColor"),
    discountType: z.enum(DISCOUNT_TYPES, "invalidValue"),
    discountValue: integerInRange(0, Number.MAX_SAFE_INTEGER),
    notes: optionalText(2000),
    paymentAccountIds: z
      .array(z.string().regex(UUID_RE, "invalidValue"))
      .max(MAX_PAYMENT_ACCOUNTS, "invalidValue")
      .refine((ids) => new Set(ids).size === ids.length, "invalidValue"),
    items: z.array(itemSchema).max(MAX_ITEMS, "invalidValue"),
  })
  .superRefine((data, ctx) => {
    if (isIsoDate(data.issueDate) && isIsoDate(data.dueDate) && data.dueDate < data.issueDate) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "dueBeforeIssue" });
    }
    if (data.discountType === "percent" && data.discountValue > MAX_PERCENT_BP) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "invalidNumber" });
    }
  });

export type InvoiceDraftInput = z.output<typeof invoiceDraftSchema>;
