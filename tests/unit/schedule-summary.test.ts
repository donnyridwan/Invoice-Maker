import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import type { Locale } from "@/i18n/config";
import { endLabel, everyLabel, ruleText, sentenceText, type RecurringT } from "@/features/recurring/schedule-summary";
import en from "@/messages/en.json";
import id from "@/messages/id.json";
import { scheduleStatus } from "@/lib/recurrence";

function translator(locale: Locale): RecurringT {
  return createTranslator({ locale, messages: locale === "en" ? en : id, namespace: "recurring" }) as unknown as RecurringT;
}

const never = { endType: "never" as const, endCount: null, endDate: null };

describe("schedule summary", () => {
  it("spells out a monthly schedule in Indonesian", () => {
    expect(sentenceText(translator("id"), "id", { frequency: "monthly", interval: 1, start: "2026-11-15", ...never })).toBe(
      "Invoice dibuat setiap bulan pada tanggal 15, mulai 15 November 2026.",
    );
  });

  it("handles intervals, weekdays, years and the end", () => {
    const t = translator("id");
    expect(ruleText(t, "id", { frequency: "weekly", interval: 2, date: "2026-10-21" })).toBe("Invoice dibuat setiap 2 minggu pada hari Rabu");
    expect(ruleText(t, "id", { frequency: "yearly", interval: 1, date: "2028-02-29" })).toBe("Invoice dibuat setiap tahun pada 29 Februari");
    expect(
      sentenceText(t, "id", { frequency: "monthly", interval: 3, start: "2026-11-15", endType: "after_count", endCount: 4, endDate: null }),
    ).toBe("Invoice dibuat setiap 3 bulan pada tanggal 15, mulai 15 November 2026, berakhir setelah 4 kali.");
    expect(endLabel(t, "id", { endType: "on_date", endCount: null, endDate: "2026-12-31" })).toBe("Berakhir pada 31 Desember 2026");
    expect(endLabel(t, "id", never)).toBeNull();
    expect(everyLabel(t, "monthly", 1)).toBe("Setiap bulan");
    expect(everyLabel(t, "yearly", 2)).toBe("Setiap 2 tahun");
  });

  it("speaks English with plurals", () => {
    const t = translator("en");
    expect(sentenceText(t, "en", { frequency: "monthly", interval: 1, start: "2026-11-15", ...never })).toBe(
      "Invoices are created every month on day 15, starting November 15, 2026.",
    );
    expect(ruleText(t, "en", { frequency: "weekly", interval: 2, date: "2026-10-21" })).toBe("Invoices are created every 2 weeks on Wednesday");
    expect(ruleText(t, "en", { frequency: "yearly", interval: 1, date: "2027-03-09" })).toBe("Invoices are created every year on March 9");
    expect(endLabel(t, "en", { endType: "after_count", endCount: 1, endDate: null })).toBe("Ends after 1 invoice");
    expect(endLabel(t, "en", { endType: "after_count", endCount: 3, endDate: null })).toBe("Ends after 3 invoices");
  });
});

describe("scheduleStatus", () => {
  const base = { endType: "never" as const, endCount: null, endDate: null, runsDone: 0, nextRunOn: "2026-11-01" };
  it("tells a schedule stopped by an error from one paused by hand", () => {
    expect(scheduleStatus({ ...base, active: false, lastError: "sourceUnavailable" })).toBe("stopped");
    expect(scheduleStatus({ ...base, active: false, lastError: "tooManyFailures" })).toBe("stopped");
    expect(scheduleStatus({ ...base, active: false, lastError: "emailFailed" })).toBe("paused");
    expect(scheduleStatus({ ...base, active: false, lastError: null })).toBe("paused");
    // Still running: the error is only a note.
    expect(scheduleStatus({ ...base, active: true, lastError: "runFailed" })).toBe("active");
    // A finished schedule stays finished.
    expect(
      scheduleStatus({ ...base, active: false, endType: "after_count", endCount: 2, runsDone: 2, lastError: "sourceUnavailable" }),
    ).toBe("finished");
  });

  it("tells active, paused and finished apart", () => {
    expect(scheduleStatus({ ...base, active: true })).toBe("active");
    expect(scheduleStatus({ ...base, active: false })).toBe("paused");
    expect(scheduleStatus({ ...base, active: false, endType: "after_count", endCount: 2, runsDone: 2 })).toBe("finished");
    expect(scheduleStatus({ ...base, active: false, endType: "on_date", endDate: "2026-10-31" })).toBe("finished");
  });
});
