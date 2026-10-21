import { addDays, isIsoDate } from "@/lib/dates";

// Pure date arithmetic for recurring invoices. Dates are calendar dates (YYYY-MM-DD).

export const RECURRING_FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const RECURRING_END_TYPES = ["never", "after_count", "on_date"] as const;
export type RecurringEndType = (typeof RECURRING_END_TYPES)[number];

/** Runs created for one schedule in one cron execution, at most. */
export const MAX_RUNS_PER_EXECUTION = 12;

export type RecurrenceRule = { frequency: RecurringFrequency; interval: number; anchorDay: number };

export type RecurrenceEnd = {
  endType: RecurringEndType;
  endCount: number | null;
  endDate: string | null;
  runsDone: number;
};

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * The run after `current`. Weekly adds 7 x interval days. Monthly and yearly move to the same
 * `anchorDay` (clamped to the length of the target month), so an anchor of 31 gives
 * 31 Jan, 28/29 Feb, 31 Mar instead of drifting to the 28th for good.
 */
export function nextRunDate(current: string, rule: RecurrenceRule): string {
  if (!isIsoDate(current)) throw new RangeError(`Invalid ISO date: ${current}`);
  if (!Number.isInteger(rule.interval) || rule.interval < 1) {
    throw new RangeError(`Invalid recurrence interval: ${rule.interval}`);
  }
  if (rule.frequency === "weekly") return addDays(current, 7 * rule.interval);

  const year = Number(current.slice(0, 4));
  const month = Number(current.slice(5, 7));
  const months = rule.frequency === "monthly" ? rule.interval : 12 * rule.interval;
  const index = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  const day = Math.min(Math.max(1, rule.anchorDay), daysInMonth(nextYear, nextMonth));
  return `${String(nextYear).padStart(4, "0")}-${pad(nextMonth)}-${pad(day)}`;
}

/** Whether a schedule has nothing left to run, given the date its next run would have. */
export function isFinished(s: RecurrenceEnd, nextRunOn: string): boolean {
  if (s.endType === "after_count") return s.endCount !== null && s.runsDone >= s.endCount;
  if (s.endType === "on_date") return s.endDate !== null && nextRunOn > s.endDate;
  return false;
}

/**
 * Every run date up to and including `today`, oldest first, at most `max`; stops early at the
 * schedule's end. The end fields may be left out (a schedule that never ends).
 */
export function dueRunDates(
  s: RecurrenceRule & { nextRunOn: string } & Partial<RecurrenceEnd>,
  today: string,
  max: number = MAX_RUNS_PER_EXECUTION,
): string[] {
  const end: RecurrenceEnd = {
    endType: s.endType ?? "never",
    endCount: s.endCount ?? null,
    endDate: s.endDate ?? null,
    runsDone: s.runsDone ?? 0,
  };
  const dates: string[] = [];
  let current = s.nextRunOn;
  while (dates.length < max && current <= today && !isFinished({ ...end, runsDone: end.runsDone + dates.length }, current)) {
    dates.push(current);
    current = nextRunDate(current, s);
  }
  return dates;
}

export type ScheduleStatus = "active" | "paused" | "finished";

/** What a schedule looks like to its owner: running, paused by hand (or by an error), or out of runs. */
export function scheduleStatus(
  s: RecurrenceEnd & { active: boolean; nextRunOn: string },
): ScheduleStatus {
  if (s.active) return "active";
  return isFinished(s, s.nextRunOn) ? "finished" : "paused";
}

/**
 * The first run date on or after `today`, skipping the ones missed while a schedule was paused
 * (they are not caught up afterwards).
 */
export function firstRunOnOrAfter(nextRunOn: string, rule: RecurrenceRule, today: string): string {
  let current = nextRunOn;
  for (let guard = 0; current < today && guard < 10_000; guard++) current = nextRunDate(current, rule);
  return current;
}
