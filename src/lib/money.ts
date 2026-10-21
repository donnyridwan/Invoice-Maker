import type { Locale } from "@/i18n/config";
import { CURRENCY_CODES, currencyDecimals, type CurrencyCode } from "./currencies";

const INTL_LOCALE: Record<Locale, string> = { id: "id-ID", en: "en-US" };

// Currency symbols/codes a user may type in front of an amount (longest first where they overlap).
const CURRENCY_PREFIX = new RegExp(`^(?:US\\$|JP¥|S\\$|Rp\\.?|RM|\\$|€|£|¥|${CURRENCY_CODES.join("|")})`, "i");

/** Digit groups of three, e.g. 1.500.000 (first group 1-3 digits, no leading zero). */
const groupedWith = (separator: string) => new RegExp(`^[1-9]\\d{0,2}(?:\\${separator}\\d{3})+$`);

/**
 * Normalises a typed amount to a plain "123.45" string, or null when it cannot be read
 * unambiguously. Rules:
 * - an optional currency symbol/code prefix and a trailing ",-" / ".-" are ignored; any other
 *   letter is rejected;
 * - with both "." and ",", the last one is the decimal separator and the other must be a strict
 *   thousands separator;
 * - a separator that occurs several times is a thousands separator (strict 3-digit groups);
 * - a single separator followed by exactly three digits is decided by the locale (id: "." is
 *   thousands, en: "," is thousands); otherwise it is the decimal separator.
 */
function normalizeAmount(input: string, locale: Locale): string | null {
  let text = input.replace(/\s/g, "").replace(/[,.]-$/, "");
  text = text.replace(CURRENCY_PREFIX, "");
  if (!/^[\d.,]+$/.test(text)) return null;

  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  const dots = text.split(".").length - 1;
  const commas = text.split(",").length - 1;

  if (dots > 0 && commas > 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    const at = Math.max(lastDot, lastComma);
    const intPart = text.slice(0, at);
    const fracPart = text.slice(at + 1);
    if (!groupedWith(thousands).test(intPart) || !/^\d+$/.test(fracPart)) return null;
    return `${intPart.split(thousands).join("")}.${fracPart}`;
  }

  const separator = dots > 0 ? "." : commas > 0 ? "," : null;
  if (separator === null) return text;

  const count = separator === "." ? dots : commas;
  if (count > 1) {
    return groupedWith(separator).test(text) ? text.split(separator).join("") : null;
  }

  const at = text.indexOf(separator);
  const intPart = text.slice(0, at);
  const fracPart = text.slice(at + 1);
  const localeThousands = locale === "id" ? "." : ",";
  if (fracPart.length === 3 && separator === localeThousands) {
    return groupedWith(separator).test(text) ? intPart + fracPart : null;
  }
  if (!/^\d+$/.test(intPart) || !/^\d+$/.test(fracPart)) return null;
  return `${intPart}.${fracPart}`;
}

/**
 * Parses user-typed money into integer minor units (e.g. cents), reading the number format
 * according to `normalizeAmount`. Returns null for anything that is not a non-negative amount.
 */
export function parseMoneyInput(
  input: string,
  currency: CurrencyCode,
  locale: Locale,
): number | null {
  const normalized = normalizeAmount(input, locale);
  if (normalized === null) return null;

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
