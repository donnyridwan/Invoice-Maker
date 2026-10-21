import { describe, expect, it } from "vitest";
import { catalogFormToInput } from "@/features/catalog/schema";

const form = (overrides: Record<string, unknown> = {}) => ({
  name: "Desain logo",
  description: "",
  unit: "proyek",
  unitPrice: "1.500.000",
  currency: "IDR",
  ...overrides,
});

describe("catalogFormToInput", () => {
  it("converts the typed price to minor units using the UI locale", () => {
    expect(catalogFormToInput(form(), "id")).toEqual({
      ok: true,
      input: expect.objectContaining({ unitPriceMinor: 1500000, currency: "IDR" }),
    });
    expect(catalogFormToInput(form({ unitPrice: "1,250.50", currency: "USD" }), "en")).toEqual({
      ok: true,
      input: expect.objectContaining({ unitPriceMinor: 125050, currency: "USD" }),
    });
  });

  it("reports an unparsable price as validation.invalidAmount on the price field", () => {
    expect(catalogFormToInput(form({ unitPrice: "abc" }), "id")).toEqual({
      ok: false,
      fieldErrors: { unitPrice: ["invalidAmount"] },
    });
    expect(catalogFormToInput(form({ unitPrice: "" }), "id")).toEqual({
      ok: false,
      fieldErrors: { unitPrice: ["invalidAmount"] },
    });
    expect(catalogFormToInput(form({ unitPrice: "-5" }), "id")).toMatchObject({ ok: false });
  });

  it("reports price and other field errors together", () => {
    const result = catalogFormToInput(form({ unitPrice: "abc", name: "" }), "id");
    expect(result).toEqual({
      ok: false,
      fieldErrors: { name: ["required"], unitPrice: ["invalidAmount"] },
    });
  });

  it("flags an unknown currency without parsing the price", () => {
    expect(catalogFormToInput(form({ currency: "XYZ" }), "id")).toEqual({
      ok: false,
      fieldErrors: { currency: ["invalidCurrency"] },
    });
  });
});
