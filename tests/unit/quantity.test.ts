import { describe, expect, it } from "vitest";
import { formatQuantity, parseQuantityInput } from "@/lib/quantity";

describe("parseQuantityInput", () => {
  it.each([
    ["1,5", "id", 1500],
    ["1.5", "en", 1500],
    ["2", "id", 2000],
    [" 2 ", "en", 2000],
    ["0,001", "id", 1],
    ["1000000", "id", 1_000_000_000],
  ] as const)("parses %j (%s) to %d", (input, locale, expected) => {
    expect(parseQuantityInput(input, locale)).toBe(expected);
  });

  it.each([
    ["0,0005", "id"],
    ["0", "id"],
    ["0,000", "id"],
    ["1000001", "id"],
    ["abc", "id"],
    ["", "id"],
    ["1.500", "id"],
    ["1,500", "en"],
    ["1.5", "id"],
    ["1,5", "en"],
    ["-1", "id"],
    [",5", "id"],
  ] as const)("rejects %j (%s)", (input, locale) => {
    expect(parseQuantityInput(input, locale)).toBeNull();
  });
});

describe("formatQuantity", () => {
  it("drops trailing zeros and uses the locale decimal separator", () => {
    expect(formatQuantity(1500, "id")).toBe("1,5");
    expect(formatQuantity(2000, "en")).toBe("2");
    expect(formatQuantity(1250, "en")).toBe("1.25");
    expect(formatQuantity(1, "en")).toBe("0.001");
    expect(formatQuantity(1_000_000_000, "id")).toBe("1000000");
  });
});
