import { z } from "zod";
import { LOCALES } from "@/i18n/config";
import { currencyCode, emptyToUndefined, optionalEmail, optionalText, requiredText } from "@/lib/zod-helpers";

/** ISO-3166 alpha-2, stored upper-case. */
const optionalCountry = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "invalidCountry")
    .transform((value) => value.toUpperCase())
    .optional(),
);

export const DEFAULT_CLIENT_CURRENCY = "IDR";
export const DEFAULT_CLIENT_LANGUAGE = "id";

export const clientSchema = z.object({
  name: requiredText(200),
  company: optionalText(200),
  email: optionalEmail,
  phone: optionalText(30),
  address: optionalText(2000),
  country: optionalCountry,
  defaultCurrency: z.preprocess(emptyToUndefined, currencyCode.default(DEFAULT_CLIENT_CURRENCY)),
  defaultLanguage: z.preprocess(emptyToUndefined, z.enum(LOCALES, "invalidValue").default(DEFAULT_CLIENT_LANGUAGE)),
  notes: optionalText(2000),
});

export type ClientInput = z.output<typeof clientSchema>;
