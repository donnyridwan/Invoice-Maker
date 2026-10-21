import { describe, expect, it } from "vitest";
import { calcLineAmount, calcTotals } from "@/lib/invoice-calc";
import { ValidationError } from "@/lib/errors";

describe("calcLineAmount", () => {
  it("multiplies quantity (milli) by unit price", () => {
    expect(calcLineAmount(1500, 200000)).toBe(300000);
  });
  it("rounds half up", () => {
    expect(calcLineAmount(333, 100)).toBe(33);
    expect(calcLineAmount(335, 100)).toBe(34);
  });
  it("throws amountTooLarge beyond MAX_SAFE_INTEGER", () => {
    expect.assertions(2);
    try {
      calcLineAmount(1_000_000_000, 10_000_000_000);
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).fieldErrors._form).toEqual(["amountTooLarge"]);
    }
  });
});

describe("calcTotals", () => {
  const items = [
    { quantityMilli: 2000, unitPriceMinor: 1500000 },
    { quantityMilli: 1000, unitPriceMinor: 500000 },
  ];

  it("applies a percentage discount (basis points)", () => {
    expect(calcTotals(items, { type: "percent", value: 1250 })).toEqual({
      lineAmounts: [3000000, 500000],
      subtotalMinor: 3500000,
      discountMinor: 437500,
      totalMinor: 3062500,
    });
  });
  it("caps a fixed discount at the subtotal", () => {
    const result = calcTotals(items, { type: "fixed", value: 5000000 });
    expect(result.discountMinor).toBe(3500000);
    expect(result.totalMinor).toBe(0);
  });
  it("applies a fixed discount below the subtotal", () => {
    const result = calcTotals(items, { type: "fixed", value: 500000 });
    expect(result.discountMinor).toBe(500000);
    expect(result.totalMinor).toBe(3000000);
  });
  it("ignores the value when the discount type is none", () => {
    const result = calcTotals(items, { type: "none", value: 999 });
    expect(result.discountMinor).toBe(0);
    expect(result.totalMinor).toBe(3500000);
  });
  it("returns zeros for no items", () => {
    expect(calcTotals([], { type: "none", value: 0 })).toEqual({
      lineAmounts: [],
      subtotalMinor: 0,
      discountMinor: 0,
      totalMinor: 0,
    });
  });
  it("throws amountTooLarge when the subtotal overflows", () => {
    const big = { quantityMilli: 1_000_000_000, unitPriceMinor: 9_000_000_000 };
    expect(() => calcTotals([big, big], { type: "none", value: 0 })).toThrow(ValidationError);
  });
});
