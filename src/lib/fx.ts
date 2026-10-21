import { currencyDecimals, type CurrencyCode } from "./currencies";

/** Units of each currency per 1 EUR, as decimal strings ("17000", "1.08"). EUR itself is "1". */
export type RateTable = Partial<Record<CurrencyCode, string>>;

/** Rates keep 10 decimals, matching the `numeric(20,10)` columns. */
const RATE_DIGITS = 10;
// BigInt() calls, not literals: the TS target (ES2017) has no bigint literal syntax.
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);
const SCALE = TEN ** BigInt(RATE_DIGITS);
const DECIMAL_RE = /^(\d+)(?:\.(\d+))?$/;

/** Divides with round half up (both operands positive). */
function divRound(numerator: bigint, denominator: bigint): bigint {
  return (numerator * TWO + denominator) / (denominator * TWO);
}

/** A non-negative decimal string as an integer multiple of 1e-10 (extra digits round half up), or null. */
function parseScaled(value: string): bigint | null {
  const match = DECIMAL_RE.exec(value.trim());
  if (!match) return null;
  const [, whole, fraction = ""] = match;
  const kept = fraction.slice(0, RATE_DIGITS).padEnd(RATE_DIGITS, "0");
  const scaled = BigInt(whole) * SCALE + BigInt(kept);
  // A leftover digit of 5 or more rounds up.
  return fraction.length > RATE_DIGITS && fraction.charCodeAt(RATE_DIGITS) >= 53 ? scaled + ONE : scaled;
}

/** An integer multiple of 1e-10 as a decimal string without trailing zeros. */
function formatScaled(scaled: bigint): string {
  const whole = scaled / SCALE;
  const fraction = (scaled % SCALE).toString().padStart(RATE_DIGITS, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

/** "17000.0000000000" -> "17000", "1.0800000000" -> "1.08"; strings without a decimal point stay as they are. */
export function trimDecimal(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/**
 * How many units of `to` one unit of `from` buys, crossed through EUR: `perEur[to] / perEur[from]`,
 * as a decimal string with at most 10 decimals. `"1"` for the same currency; null when either
 * currency has no (positive) rate in `table`.
 */
export function rateBetween(from: CurrencyCode, to: CurrencyCode, table: RateTable): string | null {
  if (from === to) return "1";
  const perEurFrom = table[from] === undefined ? null : parseScaled(table[from]);
  const perEurTo = table[to] === undefined ? null : parseScaled(table[to]);
  if (!perEurFrom || !perEurTo) return null;
  return formatScaled(divRound(perEurTo * SCALE, perEurFrom));
}

/**
 * Converts an amount in the minor units of `from` to the minor units of `to` with `rate` (units of
 * `to` per unit of `from`, a decimal string). Exact BigInt arithmetic at 1e-10 scale, corrected for
 * the difference in decimals (IDR/JPY have none, the rest have two), rounded half up.
 */
export function convertMinor(amountMinor: number, from: CurrencyCode, to: CurrencyCode, rate: string): number {
  const scaledRate = parseScaled(rate);
  if (scaledRate === null) throw new Error(`Invalid exchange rate: ${rate}`);
  const negative = amountMinor < 0;
  const amount = BigInt(Math.abs(Math.round(amountMinor)));
  // minor_to = minor_from * rate * 10^(decimals_to - decimals_from)
  let numerator = amount * scaledRate;
  let denominator = SCALE;
  const shift = currencyDecimals(to) - currencyDecimals(from);
  if (shift > 0) numerator *= TEN ** BigInt(shift);
  else if (shift < 0) denominator *= TEN ** BigInt(-shift);
  const result = Number(divRound(numerator, denominator));
  return negative ? -result : result;
}
