import { describe, expect, it } from "vitest";
import {
  CURRENCY_CODES,
  currencyDecimals,
  isCurrencyCode,
} from "@/lib/currencies";
import { formatMoney, formatMoneyInput, parseMoneyInput } from "@/lib/money";

// Intl output uses no-break spaces; compare with plain spaces.
const norm = (s: string) => s.replace(/ /g, " ");

describe("parseMoneyInput", () => {
  it.each([
    ["1.500.000", "IDR", "id", 1500000],
    ["1,500,000", "IDR", "en", 1500000],
    ["1500000", "IDR", "id", 1500000],
    ["12,5", "USD", "id", 1250],
    ["12.5", "USD", "en", 1250],
    ["0,005", "USD", "id", 1],
    ["Rp 2.000", "IDR", "id", 2000],
  ] as const)("parses %s (%s, %s) to %d", (input, currency, locale, expected) => {
    expect(parseMoneyInput(input, currency, locale)).toBe(expected);
  });

  it("rounds half up on the digit after the currency precision", () => {
    expect(parseMoneyInput("0,004", "USD", "id")).toBe(0);
    expect(parseMoneyInput("1,005", "USD", "id")).toBe(101);
    expect(parseMoneyInput("1.234,56", "IDR", "id")).toBe(1235);
  });

  it("returns null for invalid, negative, or empty input", () => {
    expect(parseMoneyInput("abc", "IDR", "id")).toBeNull();
    expect(parseMoneyInput("-5", "IDR", "id")).toBeNull();
    expect(parseMoneyInput("", "IDR", "id")).toBeNull();
    expect(parseMoneyInput("1,2,3.4.5x", "USD", "en")).toBeNull();
  });

  it("returns null when the amount exceeds the safe integer range", () => {
    expect(parseMoneyInput("99999999999999999999", "IDR", "en")).toBeNull();
  });
});

describe("formatMoney", () => {
  it.each([
    [5000000, "IDR", "id", "Rp 5.000.000"],
    [5000000, "IDR", "en", "IDR 5,000,000"],
    [125000, "USD", "en", "$1,250.00"],
    [125000, "USD", "id", "US$1.250,00"],
    [1000, "JPY", "id", "JP¥1.000"],
  ] as const)("formats %d %s in %s as %s", (minor, currency, locale, expected) => {
    expect(norm(formatMoney(minor, currency, locale))).toBe(expected);
  });
});

describe("formatMoneyInput", () => {
  it("formats without a currency symbol, using the locale separators", () => {
    expect(norm(formatMoneyInput(125000, "USD", "id"))).toBe("1.250,00");
    expect(norm(formatMoneyInput(125000, "USD", "en"))).toBe("1,250.00");
    expect(norm(formatMoneyInput(5000000, "IDR", "id"))).toBe("5.000.000");
  });

  it("round-trips through parseMoneyInput", () => {
    for (const locale of ["id", "en"] as const) {
      expect(parseMoneyInput(formatMoneyInput(123456789, "USD", locale), "USD", locale)).toBe(123456789);
      expect(parseMoneyInput(formatMoneyInput(123456789, "IDR", locale), "IDR", locale)).toBe(123456789);
    }
  });
});

describe("currencies", () => {
  it("lists the supported currencies", () => {
    expect(CURRENCY_CODES).toEqual([
      "IDR", "USD", "SGD", "EUR", "AUD", "GBP", "MYR", "JPY", "CAD", "CHF", "HKD", "NZD", "CNY", "THB",
    ]);
  });

  it("uses 0 decimals for IDR and JPY and 2 for the rest", () => {
    expect(currencyDecimals("IDR")).toBe(0);
    expect(currencyDecimals("JPY")).toBe(0);
    expect(currencyDecimals("USD")).toBe(2);
    expect(currencyDecimals("THB")).toBe(2);
  });

  it("recognises currency codes", () => {
    expect(isCurrencyCode("IDR")).toBe(true);
    expect(isCurrencyCode("XYZ")).toBe(false);
    expect(isCurrencyCode("idr")).toBe(false);
  });
});
