import { TIME_ZONE } from "@/i18n/config";

const DAY_MS = 86_400_000;
const JAKARTA_OFFSET_MS = 7 * 3_600_000;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS = {
  id: [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
} as const;

/** Parses a YYYY-MM-DD string to UTC midnight, or null when it is not a real calendar date. */
function parseIsoDate(value: string): number | null {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return time;
}

function toIso(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function mustParse(value: string): number {
  const time = parseIsoDate(value);
  if (time === null) throw new RangeError(`Invalid ISO date: ${value}`);
  return time;
}

export function isIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

/** Today's calendar date (YYYY-MM-DD) in the display time zone (Asia/Jakarta). */
export function todayInJakarta(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The start of a calendar day in Asia/Jakarta (UTC+7, no DST) as an instant. */
export function startOfJakartaDay(date: string): Date {
  return new Date(mustParse(date) - JAKARTA_OFFSET_MS);
}

/** Calendar-date arithmetic, done at UTC midnight so DST/zones never shift the result. */
export function addDays(date: string, days: number): string {
  return toIso(mustParse(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((mustParse(to) - mustParse(from)) / DAY_MS);
}

/** "21/10/2026", the same in both languages. */
export function formatNumericDate(date: string): string {
  const d = new Date(mustParse(date));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** "21 Okt 2026" (id) or "21 Oct, 2026" (en). */
export function formatShortDate(date: string, language: "id" | "en"): string {
  const d = new Date(mustParse(date));
  const month = MONTHS[language][d.getUTCMonth()].slice(0, 3);
  const day = String(d.getUTCDate()).padStart(2, "0");
  return language === "id" ? `${day} ${month} ${d.getUTCFullYear()}` : `${day} ${month}, ${d.getUTCFullYear()}`;
}

/** "21 Oktober 2026" (id) or "October 21, 2026" (en). */
export function formatDocDate(date: string, language: "id" | "en"): string {
  const time = mustParse(date);
  const d = new Date(time);
  const month = MONTHS[language][d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  return language === "id" ? `${day} ${month} ${year}` : `${month} ${day}, ${year}`;
}
