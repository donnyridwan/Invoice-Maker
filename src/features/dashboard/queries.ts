import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, invoices } from "@/db/schema";
import { countPendingClaims } from "@/features/payment-claims/queries";
import { getRateTableOnOrBefore } from "@/features/fx/queries";
import { isCurrencyCode, type CurrencyCode } from "@/lib/currencies";
import { addDays, startOfJakartaDay } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { convertMinor, rateBetween, type RateTable } from "@/lib/fx";

/** Per currency: the sum in minor units and the number of invoices. */
export type CurrencyTotals = { currency: CurrencyCode; totalMinor: number; count: number }[];

/** One summary card, in the owner's base currency. */
export type DashboardCard = {
  baseCurrency: CurrencyCode;
  /** Base-currency invoices plus every other invoice converted with a known rate. */
  totalBaseMinor: number;
  /** Whether at least one invoice was converted (the amount is then approximate: shown with "≈"). */
  converted: boolean;
  /** The newest date of the exchange rates used for the conversions; null when none was converted. */
  rateDate: string | null;
  /** Invoices in another currency that could not be converted (no rate known), per currency. */
  withoutRate: CurrencyTotals;
  /** All invoices of the card, in any currency. */
  count: number;
};

export type DashboardSummary = {
  unpaid: DashboardCard;
  overdue: DashboardCard;
  paidThisMonth: DashboardCard;
  pendingClaims: number;
};

const UNPAID_STATUSES = ["sent", "payment_claimed"] as const;

/** `[start, end)` of the Asia/Jakarta calendar month that contains `today` (YYYY-MM-DD), as instants. */
function monthBounds(today: string): { start: Date; end: Date } {
  const first = `${today.slice(0, 7)}-01`;
  // The 1st plus 31 days is always in the next month; snap that back to its first day.
  const next = `${addDays(first, 31).slice(0, 7)}-01`;
  return { start: startOfJakartaDay(first), end: startOfJakartaDay(next) };
}

type InvoiceRow = {
  currency: string;
  totalMinor: number;
  issueDate: string;
  fxRateToBase: string | null;
  fxRateDate: string | null;
  fxBaseCurrency: string | null;
};

type RateTables = { date: string; rates: RateTable };

/** Whether the rate stored on `row` was computed against `baseCurrency` (a base change makes it stale). */
function hasUsableRate(row: InvoiceRow, baseCurrency: CurrencyCode): boolean {
  return row.fxRateToBase !== null && row.fxBaseCurrency === baseCurrency;
}

/**
 * Totals of `rows` in `baseCurrency`. Base-currency invoices are added as they are; others are
 * converted with the rate stored on the invoice while it was computed against this same base,
 * else with the rates `tableFor` finds for the invoice's issue date, and listed under
 * `withoutRate` when neither knows the currency.
 */
function buildCard(
  rows: InvoiceRow[],
  baseCurrency: CurrencyCode,
  tableFor: (issueDate: string) => RateTables | null,
): DashboardCard {
  let totalBaseMinor = 0;
  let converted = false;
  let rateDate: string | null = null;
  let count = 0;
  const withoutRate = new Map<CurrencyCode, { totalMinor: number; count: number }>();

  for (const row of rows) {
    if (!isCurrencyCode(row.currency)) continue;
    count += 1;
    if (row.currency === baseCurrency) {
      totalBaseMinor += row.totalMinor;
      continue;
    }

    let rate: string | null = null;
    let date: string | null = null;
    if (hasUsableRate(row, baseCurrency)) {
      rate = row.fxRateToBase;
      date = row.fxRateDate;
    } else {
      const table = tableFor(row.issueDate);
      if (table) {
        rate = rateBetween(row.currency, baseCurrency, table.rates);
        date = table.date;
      }
    }
    if (rate === null) {
      const entry = withoutRate.get(row.currency) ?? { totalMinor: 0, count: 0 };
      withoutRate.set(row.currency, { totalMinor: entry.totalMinor + row.totalMinor, count: entry.count + 1 });
      continue;
    }
    totalBaseMinor += convertMinor(row.totalMinor, row.currency, baseCurrency, rate);
    converted = true;
    if (date && (rateDate === null || date > rateDate)) rateDate = date;
  }

  return {
    baseCurrency,
    totalBaseMinor,
    converted,
    rateDate,
    withoutRate: [...withoutRate]
      .map(([currency, entry]) => ({ currency, ...entry }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    count,
  };
}

/**
 * The dashboard numbers of `userId`, with `today` the Asia/Jakarta date (YYYY-MM-DD):
 * - unpaid: sent and payment_claimed invoices;
 * - overdue: the part of unpaid whose due date is before today;
 * - paidThisMonth: paid invoices whose `paidAt` falls in this calendar month in Jakarta;
 * - pendingClaims: payment claims waiting for a decision.
 * Each card is one total in the profile's base currency (see `buildCard`).
 */
export async function getDashboardSummary(userId: string, today: string): Promise<DashboardSummary> {
  const [profile] = await db
    .select({ baseCurrency: businessProfiles.baseCurrency })
    .from(businessProfiles)
    .where(eq(businessProfiles.userId, userId))
    .limit(1);
  if (!profile) throw new NotFoundError("Business profile not found");

  const rowsWhere = (...conditions: Parameters<typeof and>) =>
    db
      .select({
        currency: invoices.currency,
        totalMinor: invoices.totalMinor,
        issueDate: invoices.issueDate,
        fxRateToBase: invoices.fxRateToBase,
        fxRateDate: invoices.fxRateDate,
        fxBaseCurrency: invoices.fxBaseCurrency,
      })
      .from(invoices)
      .where(and(eq(invoices.userId, userId), ...conditions));

  const month = monthBounds(today);
  const [unpaid, overdue, paidThisMonth, pendingClaims] = await Promise.all([
    rowsWhere(inArray(invoices.status, UNPAID_STATUSES)),
    rowsWhere(inArray(invoices.status, UNPAID_STATUSES), lt(invoices.dueDate, today)),
    rowsWhere(eq(invoices.status, "paid"), gte(invoices.paidAt, month.start), lt(invoices.paidAt, month.end)),
    countPendingClaims(userId),
  ]);

  // Invoices without a usable stored rate (none yet, or computed for another base) are converted with
  // the rates on or before their issue date (else the latest); each date is read once, and only if needed.
  const base = isCurrencyCode(profile.baseCurrency) ? profile.baseCurrency : "IDR";
  const needsTable = [...unpaid, ...overdue, ...paidThisMonth].filter(
    (row) => row.currency !== base && !hasUsableRate(row, base),
  );
  const tables = new Map<string, RateTables | null>();
  for (const date of new Set(needsTable.map((row) => row.issueDate))) {
    tables.set(date, await getRateTableOnOrBefore(date));
  }
  const tableFor = (issueDate: string) => tables.get(issueDate) ?? null;

  return {
    unpaid: buildCard(unpaid, base, tableFor),
    overdue: buildCard(overdue, base, tableFor),
    paidThisMonth: buildCard(paidThisMonth, base, tableFor),
    pendingClaims,
  };
}
