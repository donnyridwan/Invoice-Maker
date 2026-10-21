import { describe, expect, it } from "vitest";
import { dueRunDates, isFinished, nextRunDate } from "@/lib/recurrence";

const monthly = (anchorDay: number, interval = 1) => ({ frequency: "monthly" as const, interval, anchorDay });

describe("nextRunDate", () => {
  it("keeps the anchor day through short months and leap years (31 -> Feb 29 -> Mar 31)", () => {
    expect(nextRunDate("2028-01-31", monthly(31))).toBe("2028-02-29");
    expect(nextRunDate("2028-02-29", monthly(31))).toBe("2028-03-31");
    expect(nextRunDate("2027-01-31", monthly(31))).toBe("2027-02-28");
    expect(nextRunDate("2027-02-28", monthly(31))).toBe("2027-03-31");
    expect(nextRunDate("2026-03-31", monthly(31))).toBe("2026-04-30");
  });

  it("moves by the interval in months and across years", () => {
    expect(nextRunDate("2026-10-15", monthly(15, 3))).toBe("2027-01-15");
    expect(nextRunDate("2026-12-01", monthly(1))).toBe("2027-01-01");
    expect(nextRunDate("2026-11-30", monthly(30, 12))).toBe("2027-11-30");
  });

  it("moves weekly by 7 x interval days", () => {
    expect(nextRunDate("2026-10-21", { frequency: "weekly", interval: 2, anchorDay: 21 })).toBe("2026-11-04");
    expect(nextRunDate("2026-12-28", { frequency: "weekly", interval: 1, anchorDay: 28 })).toBe("2027-01-04");
  });

  it("moves yearly and falls back to Feb 28 outside leap years", () => {
    const yearly = { frequency: "yearly" as const, interval: 1, anchorDay: 29 };
    expect(nextRunDate("2028-02-29", yearly)).toBe("2029-02-28");
    expect(nextRunDate("2031-02-28", yearly)).toBe("2032-02-29");
    expect(nextRunDate("2026-10-21", { ...yearly, interval: 2, anchorDay: 21 })).toBe("2028-10-21");
  });

  it("rejects an invalid interval or date instead of looping", () => {
    expect(() => nextRunDate("2026-10-21", monthly(21, 0))).toThrow(RangeError);
    expect(() => nextRunDate("2026-10-21", { frequency: "weekly", interval: 1.5, anchorDay: 21 })).toThrow(RangeError);
    expect(() => nextRunDate("2026-13-01", monthly(1))).toThrow(RangeError);
  });
});

describe("isFinished", () => {
  const base = { endType: "never" as const, endCount: null, endDate: null, runsDone: 0 };

  it("never ends for 'never'", () => {
    expect(isFinished({ ...base, runsDone: 500 }, "2030-01-01")).toBe(false);
  });

  it("ends once runsDone reaches endCount", () => {
    expect(isFinished({ ...base, endType: "after_count", endCount: 3, runsDone: 3 }, "2026-11-01")).toBe(true);
    expect(isFinished({ ...base, endType: "after_count", endCount: 3, runsDone: 2 }, "2026-11-01")).toBe(false);
  });

  it("ends when the next run is after the end date (the end date itself still runs)", () => {
    const s = { ...base, endType: "on_date" as const, endDate: "2026-12-31" };
    expect(isFinished(s, "2027-01-01")).toBe(true);
    expect(isFinished(s, "2026-12-31")).toBe(false);
  });
});

describe("dueRunDates", () => {
  const s = { ...monthly(1), nextRunOn: "2026-07-01" };

  it("lists every run date up to today", () => {
    expect(dueRunDates(s, "2026-10-21")).toEqual(["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]);
  });

  it("includes today and is empty for a future next run", () => {
    expect(dueRunDates({ ...s, nextRunOn: "2026-10-21" }, "2026-10-21")).toEqual(["2026-10-21"]);
    expect(dueRunDates({ ...s, nextRunOn: "2026-10-22" }, "2026-10-21")).toEqual([]);
  });

  it("caps at 12 by default and at max when given", () => {
    expect(dueRunDates({ ...s, nextRunOn: "2020-01-01" }, "2026-10-21")).toHaveLength(12);
    expect(dueRunDates(s, "2026-10-21", 2)).toEqual(["2026-07-01", "2026-08-01"]);
  });

  it("stops at the end condition", () => {
    const counted = { ...s, endType: "after_count" as const, endCount: 3, endDate: null, runsDone: 1 };
    expect(dueRunDates(counted, "2026-10-21")).toEqual(["2026-07-01", "2026-08-01"]);
    const dated = { ...s, endType: "on_date" as const, endCount: null, endDate: "2026-08-15", runsDone: 0 };
    expect(dueRunDates(dated, "2026-10-21")).toEqual(["2026-07-01", "2026-08-01"]);
  });
});
