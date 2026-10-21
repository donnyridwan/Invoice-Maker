import { desc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { exchangeRates } from "@/db/schema";
import { isCurrencyCode, type CurrencyCode } from "@/lib/currencies";
import { rateBetween, trimDecimal, type RateTable } from "@/lib/fx";
import type { Tx } from "@/features/invoices/queries";

/** Upserts one day of rates (EUR-based) and returns how many currencies were written. */
export async function saveRates(date: string, rates: RateTable): Promise<number> {
  const rows = Object.entries(rates)
    .filter((entry): entry is [CurrencyCode, string] => isCurrencyCode(entry[0]) && typeof entry[1] === "string")
    .map(([currency, perEur]) => ({ date, currency, perEur }));
  if (rows.length === 0) return 0;
  await db
    .insert(exchangeRates)
    .values(rows)
    .onConflictDoUpdate({
      target: [exchangeRates.date, exchangeRates.currency],
      set: { perEur: sql`excluded.per_eur` },
    });
  return rows.length;
}

/**
 * The rates of the newest day that is on or before `date`; when nothing is that old (a fresh
 * install, or an invoice dated before the first fetch), the newest day available. Null when the
 * table is empty. Values are trimmed to plain decimal strings ("17000", not "17000.0000000000").
 */
export async function getRateTableOnOrBefore(
  date: string,
  executor: Pick<Tx, "select"> = db,
): Promise<{ date: string; rates: RateTable } | null> {
  const newest = (where?: ReturnType<typeof lte>) =>
    executor
      .select({ date: exchangeRates.date })
      .from(exchangeRates)
      .where(where)
      .orderBy(desc(exchangeRates.date))
      .limit(1);
  const [found] = await newest(lte(exchangeRates.date, date));
  const [chosen] = found ? [found] : await newest();
  if (!chosen) return null;

  const rows = await executor
    .select({ currency: exchangeRates.currency, perEur: exchangeRates.perEur })
    .from(exchangeRates)
    .where(eq(exchangeRates.date, chosen.date));
  const rates: RateTable = {};
  for (const row of rows) {
    if (isCurrencyCode(row.currency)) rates[row.currency] = trimDecimal(row.perEur);
  }
  return { date: chosen.date, rates };
}

/**
 * The rate to store on an invoice: units of `baseCurrency` per unit of `currency`, from the rates
 * on or before `issueDate` (else the newest known), with the date of the rates used. `"1"` when
 * the currency is the base; null when no rate is known.
 */
export async function fxForInvoice(
  currency: string,
  baseCurrency: string,
  issueDate: string,
  executor: Pick<Tx, "select"> = db,
): Promise<{ rate: string; date: string } | null> {
  if (!isCurrencyCode(currency) || !isCurrencyCode(baseCurrency)) return null;
  if (currency === baseCurrency) return { rate: "1", date: issueDate };
  const table = await getRateTableOnOrBefore(issueDate, executor);
  if (!table) return null;
  const rate = rateBetween(currency, baseCurrency, table.rates);
  return rate === null ? null : { rate, date: table.date };
}
