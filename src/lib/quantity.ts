import type { Locale } from "@/i18n/config";

/** Quantities are stored in thousandths ("milli"): 1,5 -> 1500. */
export const MAX_QUANTITY_MILLI = 1_000_000_000;

const DECIMAL_SEPARATOR: Record<Locale, string> = { id: ",", en: "." };

/**
 * Parses a typed quantity into milli-units. The decimal separator follows the locale
 * ("," for id, "." for en); thousands separators are not accepted. At most 3 decimals,
 * greater than 0 and at most 1e9 milli. Returns null otherwise.
 */
export function parseQuantityInput(input: string, locale: Locale): number | null {
  const text = input.trim();
  const separator = DECIMAL_SEPARATOR[locale];
  const [intPart, fracPart = "", ...rest] = text.split(separator);
  if (rest.length > 0) return null;
  if (!/^\d+$/.test(intPart)) return null;
  if (text.includes(separator) && !/^\d{1,3}$/.test(fracPart)) return null;

  const milli = Number(intPart) * 1000 + Number(fracPart.padEnd(3, "0"));
  if (!Number.isSafeInteger(milli) || milli <= 0 || milli > MAX_QUANTITY_MILLI) return null;
  return milli;
}

/** Inverse of `parseQuantityInput`, without trailing zeros: 1500 -> "1,5" (id). */
export function formatQuantity(milli: number, locale: Locale): string {
  const whole = Math.trunc(milli / 1000);
  const frac = String(Math.abs(milli % 1000))
    .padStart(3, "0")
    .replace(/0+$/, "");
  return frac ? `${whole}${DECIMAL_SEPARATOR[locale]}${frac}` : String(whole);
}
