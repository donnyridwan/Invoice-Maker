import { describe, expect, it } from "vitest";
import { formatRelativeTime, formatWibDateTime } from "@/lib/relative-time";

// 2026-10-21 12:00 WIB
const NOW = new Date("2026-10-21T05:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelativeTime", () => {
  it("says now for the last moments (and for a clock that is slightly ahead)", () => {
    expect(formatRelativeTime(ago(5_000), NOW, "id")).toBe("sekarang");
    expect(formatRelativeTime(new Date(NOW.getTime() + 30_000), NOW, "en")).toBe("now");
  });

  it("counts minutes and hours", () => {
    expect(formatRelativeTime(ago(3 * MIN), NOW, "id")).toBe("3 menit yang lalu");
    expect(formatRelativeTime(ago(3 * MIN), NOW, "en")).toBe("3 minutes ago");
    expect(formatRelativeTime(ago(2 * HOUR), NOW, "id")).toBe("2 jam yang lalu");
    expect(formatRelativeTime(ago(2 * HOUR), NOW, "en")).toBe("2 hours ago");
  });

  it("uses calendar days in Jakarta time once a day has passed", () => {
    // 2026-10-20 23:00 WIB is 13 hours ago, still "hours"
    expect(formatRelativeTime(new Date("2026-10-20T16:00:00Z"), NOW, "id")).toBe("13 jam yang lalu");
    // 2026-10-20 08:00 WIB: more than 24h ago, calendar day before
    expect(formatRelativeTime(new Date("2026-10-20T01:00:00Z"), NOW, "id")).toBe("kemarin");
    expect(formatRelativeTime(new Date("2026-10-20T01:00:00Z"), NOW, "en")).toBe("yesterday");
    expect(formatRelativeTime(ago(3 * DAY), NOW, "id")).toBe("3 hari yang lalu");
    expect(formatRelativeTime(ago(3 * DAY), NOW, "en")).toBe("3 days ago");
  });

  it("falls back to the WIB date and time after a week", () => {
    expect(formatRelativeTime(new Date("2026-10-10T07:05:00Z"), NOW, "id")).toBe("10 Oktober 2026, 14:05 WIB");
    expect(formatRelativeTime(new Date("2026-10-10T07:05:00Z"), NOW, "en")).toBe("October 10, 2026, 14:05 WIB");
  });
});

describe("formatWibDateTime", () => {
  it("rolls over midnight in Jakarta", () => {
    expect(formatWibDateTime(new Date("2026-10-20T17:30:00Z"), "id")).toBe("21 Oktober 2026, 00:30 WIB");
  });
});
