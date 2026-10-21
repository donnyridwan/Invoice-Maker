import { describe, expect, it } from "vitest";
import { addDays, daysBetween, formatDocDate, isIsoDate, todayInJakarta } from "@/lib/dates";

describe("todayInJakarta", () => {
  it("rolls over to the next day after 17:00 UTC", () => {
    expect(todayInJakarta(new Date("2026-10-21T18:30:00Z"))).toBe("2026-10-22");
  });
  it("stays on the same day before 17:00 UTC", () => {
    expect(todayInJakarta(new Date("2026-10-21T16:59:00Z"))).toBe("2026-10-21");
  });
});

describe("addDays", () => {
  it.each([
    ["2026-12-25", 14, "2027-01-08"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2026-10-21", 0, "2026-10-21"],
  ])("addDays(%s, %d) = %s", (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween("2026-10-21", "2026-11-04")).toBe(14);
    expect(daysBetween("2026-11-04", "2026-10-21")).toBe(-14);
    expect(daysBetween("2026-10-21", "2026-10-21")).toBe(0);
  });
});

describe("formatDocDate", () => {
  it("formats in Indonesian and English", () => {
    expect(formatDocDate("2026-10-21", "id")).toBe("21 Oktober 2026");
    expect(formatDocDate("2026-10-21", "en")).toBe("October 21, 2026");
    expect(formatDocDate("2026-01-05", "id")).toBe("5 Januari 2026");
  });
});

describe("isIsoDate", () => {
  it.each([
    ["2026-10-21", true],
    ["2028-02-29", true],
    ["2026-02-30", false],
    ["2026-13-01", false],
    ["2026-1-1", false],
    ["21-10-2026", false],
    ["", false],
  ])("isIsoDate(%j) = %s", (value, expected) => {
    expect(isIsoDate(value)).toBe(expected);
  });
});
