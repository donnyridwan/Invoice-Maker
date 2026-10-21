import { daysBetween } from "@/lib/dates";
import type { Invoice } from "./queries";

/** What the owner (and the list) see: the stored status refined by views and the due date. */
export type DisplayStatus = "draft" | "sent" | "viewed" | "awaiting_confirmation" | "paid" | "overdue" | "void";

/**
 * Derives the label shown for an invoice. `today` is the Asia/Jakarta calendar date (YYYY-MM-DD);
 * an invoice due today is not overdue yet. Priority: void, paid, overdue (sent or payment_claimed
 * and past due), awaiting_confirmation, viewed, sent, draft.
 */
export function displayStatus(
  inv: Pick<Invoice, "status" | "dueDate" | "firstViewedAt">,
  today: string,
): DisplayStatus {
  switch (inv.status) {
    case "void":
      return "void";
    case "paid":
      return "paid";
    case "draft":
      return "draft";
    case "payment_claimed":
      return inv.dueDate < today ? "overdue" : "awaiting_confirmation";
    case "sent":
      if (inv.dueDate < today) return "overdue";
      return inv.firstViewedAt ? "viewed" : "sent";
  }
}

/** How far the due date is from `today`, in whole calendar days. */
export function dueRelative(
  dueDate: string,
  today: string,
): { kind: "today" | "inDays" | "overdueDays"; days: number } {
  const days = daysBetween(today, dueDate);
  if (days === 0) return { kind: "today", days: 0 };
  return days > 0 ? { kind: "inDays", days } : { kind: "overdueDays", days: -days };
}
