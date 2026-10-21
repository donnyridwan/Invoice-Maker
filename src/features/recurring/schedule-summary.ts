import type { Locale } from "@/i18n/config";
import { formatDocDate } from "@/lib/dates";
import type { RecurringEndType, RecurringFrequency } from "@/lib/recurrence";
import type { Schedule } from "./queries";

/** The part of a schedule the UI shows and edits (what the server sends to client components). */
export type ScheduleView = Pick<
  Schedule,
  | "id"
  | "frequency"
  | "interval"
  | "anchorDay"
  | "nextRunOn"
  | "endType"
  | "endCount"
  | "endDate"
  | "runsDone"
  | "delivery"
  | "active"
  | "lastError"
>;

export function toScheduleView(s: Schedule): ScheduleView {
  return {
    id: s.id,
    frequency: s.frequency,
    interval: s.interval,
    anchorDay: s.anchorDay,
    nextRunOn: s.nextRunOn,
    endType: s.endType,
    endCount: s.endCount,
    endDate: s.endDate,
    runsDone: s.runsDone,
    delivery: s.delivery,
    active: s.active,
    lastError: s.lastError,
  };
}

/** A translator for the `recurring` messages. */
export type RecurringT = (key: string, values?: Record<string, string | number>) => string;

function weekdayName(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/** "15 November" / "November 15": a date without its year. */
function dayAndMonth(date: string, locale: Locale): string {
  return formatDocDate(date, locale).replace(locale === "id" ? / \d{4}$/ : /, \d{4}$/, "");
}

/** "bulan", "2 minggu" / "month", "2 weeks". */
export function everyText(t: RecurringT, frequency: RecurringFrequency, interval: number): string {
  const unit = t(`unit.${frequency}`, { interval });
  return interval === 1 ? unit : `${interval} ${unit}`;
}

/** "Setiap bulan" / "Setiap 2 minggu". */
export function everyLabel(t: RecurringT, frequency: RecurringFrequency, interval: number): string {
  return t("every", { unit: everyText(t, frequency, interval) });
}

/** "Invoice dibuat setiap bulan pada tanggal 15", with `date` giving the day / weekday / month of the runs. */
export function ruleText(
  t: RecurringT,
  locale: Locale,
  s: { frequency: RecurringFrequency; interval: number; date: string },
): string {
  const unit = everyText(t, s.frequency, s.interval);
  if (s.frequency === "weekly") return t("rule.weekly", { unit, weekday: weekdayName(s.date, locale) });
  if (s.frequency === "monthly") return t("rule.monthly", { unit, day: Number(s.date.slice(8, 10)) });
  return t("rule.yearly", { unit, date: dayAndMonth(s.date, locale) });
}

/** "Berakhir setelah 3 kali" / "Berakhir pada 31 Desember 2026" / null when it never ends. */
export function endLabel(
  t: RecurringT,
  locale: Locale,
  s: { endType: RecurringEndType; endCount: number | null; endDate: string | null },
): string | null {
  if (s.endType === "after_count" && s.endCount) return t("end.after", { count: s.endCount });
  if (s.endType === "on_date" && s.endDate) return t("end.on", { date: formatDocDate(s.endDate, locale) });
  return null;
}

/** The sentence under the dialog's fields: "Invoice dibuat setiap bulan pada tanggal 15, mulai 15 November 2026." */
export function sentenceText(
  t: RecurringT,
  locale: Locale,
  s: {
    frequency: RecurringFrequency;
    interval: number;
    start: string;
    endType: RecurringEndType;
    endCount: number | null;
    endDate: string | null;
  },
): string {
  const end = endLabel(t, locale, s);
  return t("sentence", {
    rule: ruleText(t, locale, { frequency: s.frequency, interval: s.interval, date: s.start }),
    start: formatDocDate(s.start, locale),
    end: end ? `, ${end.charAt(0).toLowerCase()}${end.slice(1)}` : "",
  });
}
