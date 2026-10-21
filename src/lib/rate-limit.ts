import { lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actionRateLimits } from "@/db/schema";

export type RateRule = { windowSeconds: number; max: number };

/** Counters whose window ended this long ago are deleted. */
const PRUNE_AFTER_MS = 24 * 3600_000;

/**
 * Counts one hit on `key` in a fixed window that starts at its first hit and lasts
 * `rule.windowSeconds`, atomically (one upsert, so concurrent hits cannot slip past `max`).
 * `allowed` is false from hit `max + 1` until the window has run out. Hits that are refused keep
 * counting, which does not extend the window.
 */
export async function consumeRateLimit(
  key: string,
  rule: RateRule,
  now: Date = new Date(),
): Promise<{ allowed: boolean; count: number }> {
  const cutoff = new Date(now.getTime() - rule.windowSeconds * 1000).toISOString();
  const expired = sql`${actionRateLimits.windowStart} <= ${cutoff}::timestamptz`;
  const [row] = await db
    .insert(actionRateLimits)
    .values({ key, count: 1, windowStart: now })
    .onConflictDoUpdate({
      target: actionRateLimits.key,
      set: {
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${actionRateLimits.count} + 1 END`,
        windowStart: sql`CASE WHEN ${expired} THEN ${now.toISOString()}::timestamptz ELSE ${actionRateLimits.windowStart} END`,
      },
    })
    .returning({ count: actionRateLimits.count });

  // A new window started: a good moment to drop counters nobody will read again.
  if (row.count === 1) {
    const pruneBefore = new Date(now.getTime() - PRUNE_AFTER_MS);
    await db
      .delete(actionRateLimits)
      .where(lt(actionRateLimits.windowStart, pruneBefore))
      .catch((e) => console.error("[rate-limit] could not prune old counters", e));
  }
  return { allowed: row.count <= rule.max, count: row.count };
}
