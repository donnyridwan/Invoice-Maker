import { and, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, invoices } from "@/db/schema";
import { countPendingClaims } from "@/features/payment-claims/queries";
import { isCurrencyCode, type CurrencyCode } from "@/lib/currencies";
import { addDays, startOfJakartaDay } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";

/** Per currency: the sum in minor units and the number of invoices. Plan 5 replaces this with converted totals. */
export type CurrencyTotals = { currency: CurrencyCode; totalMinor: number; count: number }[];

export type DashboardSummary = {
  unpaid: CurrencyTotals;
  overdue: CurrencyTotals;
  paidThisMonth: CurrencyTotals;
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

/** Orders totals with the base currency first, the others alphabetically. */
function ordered(rows: { currency: string; totalMinor: number; count: number }[], base: string): CurrencyTotals {
  return rows
    .filter((row): row is { currency: CurrencyCode; totalMinor: number; count: number } => isCurrencyCode(row.currency))
    .sort((a, b) => Number(b.currency === base) - Number(a.currency === base) || a.currency.localeCompare(b.currency));
}

/**
 * The dashboard numbers of `userId`, with `today` the Asia/Jakarta date (YYYY-MM-DD):
 * - unpaid: sent and payment_claimed invoices;
 * - overdue: the part of unpaid whose due date is before today;
 * - paidThisMonth: paid invoices whose `paidAt` falls in this calendar month in Jakarta;
 * - pendingClaims: payment claims waiting for a decision.
 */
export async function getDashboardSummary(userId: string, today: string): Promise<DashboardSummary> {
  const [profile] = await db
    .select({ baseCurrency: businessProfiles.baseCurrency })
    .from(businessProfiles)
    .where(eq(businessProfiles.userId, userId))
    .limit(1);
  if (!profile) throw new NotFoundError("Business profile not found");

  const totals = (...conditions: Parameters<typeof and>) =>
    db
      .select({
        currency: invoices.currency,
        totalMinor: sql<number>`coalesce(sum(${invoices.totalMinor}), 0)`.mapWith(Number),
        count: count(),
      })
      .from(invoices)
      .where(and(eq(invoices.userId, userId), ...conditions))
      .groupBy(invoices.currency);

  const month = monthBounds(today);
  const [unpaid, overdue, paidThisMonth, pendingClaims] = await Promise.all([
    totals(inArray(invoices.status, UNPAID_STATUSES)),
    totals(inArray(invoices.status, UNPAID_STATUSES), lt(invoices.dueDate, today)),
    totals(eq(invoices.status, "paid"), gte(invoices.paidAt, month.start), lt(invoices.paidAt, month.end)),
    countPendingClaims(userId),
  ]);

  return {
    unpaid: ordered(unpaid, profile.baseCurrency),
    overdue: ordered(overdue, profile.baseCurrency),
    paidThisMonth: ordered(paidThisMonth, profile.baseCurrency),
    pendingClaims,
  };
}
