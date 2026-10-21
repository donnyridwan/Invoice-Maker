import { CURRENCY_CODES, type CurrencyCode } from "@/lib/currencies";
import { isIsoDate } from "@/lib/dates";
import { trimDecimal, type RateTable } from "@/lib/fx";

export const FRANKFURTER_LATEST_URL = "https://api.frankfurter.app/latest";
const FETCH_TIMEOUT_MS = 15_000;

/** A positive finite number as a plain decimal string ("1.08", never "1e-7"). */
function toDecimalString(value: number): string {
  return trimDecimal(value.toFixed(10));
}

/**
 * The latest ECB reference rates from Frankfurter (base EUR), reduced to the currencies the app
 * supports; anything else, or a non-positive value, is ignored. EUR itself is "1". Throws on a
 * network error, a non-200 response or a body that is not `{ date, rates }`.
 */
export async function fetchLatestRates(fetchImpl: typeof fetch = fetch): Promise<{ date: string; rates: RateTable }> {
  const response = await fetchImpl(FRANKFURTER_LATEST_URL, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status !== 200) throw new Error(`Exchange rate request failed with status ${response.status}`);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Exchange rate response is not valid JSON");
  }
  const { date, rates: raw } = (body ?? {}) as { date?: unknown; rates?: unknown };
  if (typeof date !== "string" || !isIsoDate(date)) throw new Error("Exchange rate response has no valid date");
  if (typeof raw !== "object" || raw === null) throw new Error("Exchange rate response has no rates");

  const rates: RateTable = { EUR: "1" };
  for (const code of CURRENCY_CODES) {
    if (code === "EUR") continue;
    const value = (raw as Record<string, unknown>)[code];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      rates[code as CurrencyCode] = toDecimalString(value);
    }
  }
  if (Object.keys(rates).length < 2) throw new Error("Exchange rate response has no supported currencies");
  return { date, rates };
}
