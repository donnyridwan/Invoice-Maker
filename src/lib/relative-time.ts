import { TIME_ZONE, type Locale } from "@/i18n/config";
import { daysBetween, formatDocDate, todayInJakarta } from "@/lib/dates";

const INTL_LOCALE: Record<Locale, string> = { id: "id-ID", en: "en-US" };
const WEEK_DAYS = 7;

function clock(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** "21 Oktober 2026, 14:05 WIB": the full date and time in the display time zone. */
export function formatWibDateTime(date: Date, locale: Locale): string {
  return `${formatDocDate(todayInJakarta(date), locale)}, ${clock(date)} WIB`;
}

/**
 * How long ago `date` was, for the activity timeline: "sekarang", "3 menit yang lalu",
 * "2 jam yang lalu", "kemarin", "3 hari yang lalu", and after a week the WIB date and time.
 * Days are calendar days in Asia/Jakarta, so 08:00 yesterday is "kemarin" whatever the hour now.
 */
export function formatRelativeTime(date: Date, now: Date, locale: Locale): string {
  const rtf = new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: "auto" });
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));

  if (seconds < 45) return rtf.format(0, "second");
  if (seconds < 3600) return rtf.format(-Math.max(1, Math.round(seconds / 60)), "minute");
  if (seconds < 86_400) return rtf.format(-Math.round(seconds / 3600), "hour");

  const days = daysBetween(todayInJakarta(date), todayInJakarta(now));
  if (days < WEEK_DAYS) return rtf.format(-Math.max(1, days), "day");
  return formatWibDateTime(date, locale);
}
