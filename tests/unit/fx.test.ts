import { describe, expect, it } from "vitest";
import { convertMinor, rateBetween, trimDecimal, type RateTable } from "@/lib/fx";

const TABLE: RateTable = { EUR: "1", USD: "1.08", IDR: "17000", JPY: "160" };

describe("rateBetween", () => {
  it("crosses through EUR: USD -> IDR = 17000 / 1.08", () => {
    const rate = rateBetween("USD", "IDR", TABLE);
    expect(Number(rate)).toBeCloseTo(15740.7407407407, 6);
    expect(rate).toBe("15740.7407407407");
  });

  it("gives the inverse direction and a EUR leg", () => {
    expect(Number(rateBetween("IDR", "USD", TABLE))).toBeCloseTo(0.0000635294, 10);
    expect(rateBetween("EUR", "USD", TABLE)).toBe("1.08");
    expect(Number(rateBetween("USD", "EUR", TABLE))).toBeCloseTo(0.9259259259, 10);
  });

  it("is exactly 1 for the same currency, even without a table entry", () => {
    expect(rateBetween("IDR", "IDR", TABLE)).toBe("1");
    expect(rateBetween("THB", "THB", {})).toBe("1");
  });

  it("is null when either currency has no rate (or a rate of zero)", () => {
    expect(rateBetween("USD", "THB", TABLE)).toBeNull();
    expect(rateBetween("THB", "USD", TABLE)).toBeNull();
    expect(rateBetween("USD", "IDR", { USD: "0", IDR: "17000" })).toBeNull();
    expect(rateBetween("USD", "IDR", { USD: "abc", IDR: "17000" })).toBeNull();
  });
});

describe("convertMinor", () => {
  it("converts USD 1.00 to Rp 15.741 (zero-decimal target, half up)", () => {
    expect(convertMinor(100, "USD", "IDR", "15740.7407407407")).toBe(15741);
  });

  it("converts Rp 1.574.074 back to USD 100.00 (within rounding of the 10-digit rate)", () => {
    expect(convertMinor(1_574_074, "IDR", "USD", "0.0000635294")).toBe(10000);
  });

  it("accounts for the difference in decimals between currencies", () => {
    // JPY has no decimals: 1000 yen at 1 JPY = 0.00625 EUR -> EUR 6.25 = 625 minor.
    expect(convertMinor(1000, "JPY", "EUR", "0.00625")).toBe(625);
    expect(convertMinor(625, "EUR", "JPY", "160")).toBe(1000);
    // Same decimals: no scaling.
    expect(convertMinor(10_000, "USD", "EUR", "0.9259259259")).toBe(9259);
  });

  it("rounds half up", () => {
    expect(convertMinor(1, "IDR", "JPY", "0.5")).toBe(1);
    expect(convertMinor(3, "IDR", "JPY", "0.5")).toBe(2);
    expect(convertMinor(1, "IDR", "JPY", "0.49")).toBe(0);
    expect(convertMinor(1, "USD", "EUR", "0.5")).toBe(1);
  });

  it("is exact for large amounts (no float error) and keeps 0 and rate 1", () => {
    expect(convertMinor(0, "USD", "IDR", "15740.7407407407")).toBe(0);
    expect(convertMinor(123_456_789, "IDR", "IDR", "1")).toBe(123_456_789);
    // Rp 9.000.000.000 -> USD at 0.0000635294 = 571,764.60
    expect(convertMinor(9_000_000_000, "IDR", "USD", "0.0000635294")).toBe(57_176_460);
  });
});

describe("trimDecimal", () => {
  it("drops trailing zeros of a fraction but never of a whole number", () => {
    expect(trimDecimal("17000.0000000000")).toBe("17000");
    expect(trimDecimal("1.0800000000")).toBe("1.08");
    expect(trimDecimal("100")).toBe("100");
    expect(trimDecimal("10.5")).toBe("10.5");
  });
});
