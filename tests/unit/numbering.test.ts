import { describe, expect, it } from "vitest";
import { allocateInvoiceNumber, formatInvoiceNumber, INVOICE_NUMBER_RE } from "@/lib/numbering";

describe("formatInvoiceNumber", () => {
  it("pads the sequence to 3 digits", () => {
    expect(formatInvoiceNumber("INV-", 2026, 7)).toBe("INV-2026-007");
  });
  it("does not truncate longer sequences or require a prefix", () => {
    expect(formatInvoiceNumber("", 2026, 1234)).toBe("2026-1234");
  });
});

describe("allocateInvoiceNumber", () => {
  it("uses nextNumber within the same year", () => {
    expect(allocateInvoiceNumber({ prefix: "INV-", nextNumber: 5, numberYear: 2026 }, 2026)).toEqual({
      number: "INV-2026-005",
      next: { nextNumber: 6, numberYear: 2026 },
    });
  });
  it("restarts at 001 when the issue year is later than numberYear", () => {
    expect(allocateInvoiceNumber({ prefix: "INV-", nextNumber: 40, numberYear: 2025 }, 2026)).toEqual({
      number: "INV-2026-001",
      next: { nextNumber: 2, numberYear: 2026 },
    });
  });
  it("keeps nextNumber and stamps the year when numberYear is null", () => {
    expect(allocateInvoiceNumber({ prefix: "INV-", nextNumber: 12, numberYear: null }, 2026)).toEqual({
      number: "INV-2026-012",
      next: { nextNumber: 13, numberYear: 2026 },
    });
  });
  it("does not reset the running sequence for a back-dated invoice", () => {
    expect(allocateInvoiceNumber({ prefix: "INV-", nextNumber: 9, numberYear: 2026 }, 2025)).toEqual({
      number: "INV-2025-009",
      next: { nextNumber: 10, numberYear: 2026 },
    });
  });
});

describe("INVOICE_NUMBER_RE", () => {
  it.each([
    ["INV-2026-001", true],
    ["A/B_c.1", true],
    ["", false],
    ["has space", false],
    ["a".repeat(41), false],
    ["a".repeat(40), true],
  ])("%j -> %s", (value, expected) => {
    expect(INVOICE_NUMBER_RE.test(value)).toBe(expected);
  });
});
