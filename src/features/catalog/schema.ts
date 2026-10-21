import { z } from "zod";
import type { Locale } from "@/i18n/config";
import { zodFieldErrors } from "@/lib/action-result";
import { isCurrencyCode } from "@/lib/currencies";
import { parseMoneyInput } from "@/lib/money";
import { currencyCode, optionalText, requiredText } from "@/lib/zod-helpers";

export const catalogItemSchema = z.object({
  name: requiredText(200),
  description: optionalText(2000),
  unit: optionalText(30),
  unitPriceMinor: z.number("invalidAmount").int("invalidAmount").min(0, "invalidAmount"),
  currency: currencyCode,
});

export type CatalogItemInput = z.output<typeof catalogItemSchema>;

export type CatalogFormValues = {
  name: string;
  description: string;
  unit: string;
  /** The price as typed by the user, in the UI locale's number format. */
  unitPrice: string;
  currency: string;
};

export type CatalogFormResult =
  | { ok: true; input: CatalogItemInput }
  | { ok: false; fieldErrors: Record<string, string[]> };

/**
 * Turns the form values into a validated `CatalogItemInput`: the typed price is parsed to minor
 * units with the UI locale, and an unparsable price is reported on the `unitPrice` field as
 * "invalidAmount" (a key of the `validation` namespace) alongside any other field errors.
 */
export function catalogFormToInput(values: CatalogFormValues, locale: Locale): CatalogFormResult {
  const { unitPrice, ...rest } = values;
  const minor = isCurrencyCode(values.currency) ? parseMoneyInput(unitPrice, values.currency, locale) : 0;

  const parsed = catalogItemSchema.safeParse({ ...rest, unitPriceMinor: minor ?? 0 });
  const fieldErrors = parsed.success ? {} : zodFieldErrors(parsed.error);
  if (fieldErrors.unitPriceMinor) {
    fieldErrors.unitPrice = fieldErrors.unitPriceMinor;
    delete fieldErrors.unitPriceMinor;
  }
  if (minor === null) fieldErrors.unitPrice = ["invalidAmount"];

  if (parsed.success && Object.keys(fieldErrors).length === 0) return { ok: true, input: parsed.data };
  return { ok: false, fieldErrors };
}
