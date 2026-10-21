export const CURRENCY_CODES = [
  "IDR",
  "USD",
  "SGD",
  "EUR",
  "AUD",
  "GBP",
  "MYR",
  "JPY",
  "CAD",
  "CHF",
  "HKD",
  "NZD",
  "CNY",
  "THB",
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

const ZERO_DECIMAL: ReadonlySet<CurrencyCode> = new Set(["IDR", "JPY"]);

export function currencyDecimals(code: CurrencyCode): 0 | 2 {
  return ZERO_DECIMAL.has(code) ? 0 : 2;
}

export function isCurrencyCode(v: string): v is CurrencyCode {
  return (CURRENCY_CODES as readonly string[]).includes(v);
}
