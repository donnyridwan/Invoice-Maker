import type { Locale } from "@/i18n/config";
import { currencyDecimals, type CurrencyCode } from "./currencies";

const INTL_LOCALE: Record<Locale, string> = { id: "id-ID", en: "en-US" };

/**
 * Parses user-typed money into integer minor units (e.g. cents).
 * Thousands separator is "." for `id` and "," for `en`; the decimal separator
 * is the other one. Returns null for anything that is not a non-negative amount.
 */
export function parseMoneyInput(
  input: string,
  currency: CurrencyCode,
  locale: Locale,
): number | null {
  const cleaned = input.replace(/[^\d.,-]/g, "");
  if (cleaned.includes("-")) return null;

  const thousands = locale === "id" ? "." : ",";
  const decimal = locale === "id" ? "," : ".";
  const normalized = cleaned.split(thousands).join("").replace(decimal, ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const decimals = currencyDecimals(currency);
  const [intPart, fracPart = ""] = normalized.split(".");
  const kept = fracPart.slice(0, decimals).padEnd(decimals, "0");
  const roundUp = fracPart.length > decimals && fracPart[decimals] >= "5";

  const minor = BigInt(intPart + kept) + BigInt(roundUp ? 1 : 0);
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(minor);
}

/** Exact decimal string for a minor-unit amount, so Intl never sees a float. */
function toDecimalString(minor: number, currency: CurrencyCode): string {
  const decimals = currencyDecimals(currency);
  const negative = minor < 0;
  const digits = Math.abs(Math.trunc(minor)).toString().padStart(decimals + 1, "0");
  const intPart = digits.slice(0, digits.length - decimals);
  const fracPart = digits.slice(digits.length - decimals);
  return `${negative ? "-" : ""}${intPart}${decimals ? `.${fracPart}` : ""}`;
}

export function formatMoney(minor: number, currency: CurrencyCode, locale: Locale): string {
  const decimals = currencyDecimals(currency);
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(toDecimalString(minor, currency) as Intl.StringNumericLiteral);
}

/** Amount without a currency symbol, for re-filling an input field. */
export function formatMoneyInput(minor: number, currency: CurrencyCode, locale: Locale): string {
  const decimals = currencyDecimals(currency);
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "decimal",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(toDecimalString(minor, currency) as Intl.StringNumericLiteral);
}
