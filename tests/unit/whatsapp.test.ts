import { describe, expect, it } from "vitest";
import { normalizeWhatsAppNumber, whatsAppMessage, whatsAppUrl } from "@/features/invoices/whatsapp";

describe("normalizeWhatsAppNumber", () => {
  it("keeps only digits and ignores a leading plus", () => {
    expect(normalizeWhatsAppNumber("+62 812-3456-7890")).toBe("6281234567890");
  });

  it("turns a leading 0 into 62", () => {
    expect(normalizeWhatsAppNumber("0812 3456 7890")).toBe("6281234567890");
    expect(normalizeWhatsAppNumber("(0812)34567890")).toBe("6281234567890");
  });

  it("strips the 00 international call prefix", () => {
    expect(normalizeWhatsAppNumber("0062 812-3456-7890")).toBe("6281234567890");
    expect(normalizeWhatsAppNumber("00 1 415 555 0100")).toBe("14155550100");
    expect(normalizeWhatsAppNumber("0044 20 7946 0958")).toBe("442079460958");
  });

  it("drops the trunk 0 after 62", () => {
    expect(normalizeWhatsAppNumber("+62 (0)812 3456 7890")).toBe("6281234567890");
    expect(normalizeWhatsAppNumber("62 0812 3456 7890")).toBe("6281234567890");
    expect(normalizeWhatsAppNumber("+620812-3456-7890")).toBe("6281234567890");
    expect(normalizeWhatsAppNumber("0062 (0)812 3456 7890")).toBe("6281234567890");
  });

  it("leaves a clean 62 number alone", () => {
    expect(normalizeWhatsAppNumber("6281234567890")).toBe("6281234567890");
  });

  it("leaves other country codes alone", () => {
    expect(normalizeWhatsAppNumber("+1 (415) 555-0100")).toBe("14155550100");
  });

  it("treats fewer than 8 digits as no number", () => {
    expect(normalizeWhatsAppNumber("123")).toBeNull();
    expect(normalizeWhatsAppNumber("0812345")).toBeNull();
    expect(normalizeWhatsAppNumber("")).toBeNull();
    expect(normalizeWhatsAppNumber("   ")).toBeNull();
    expect(normalizeWhatsAppNumber("abc")).toBeNull();
    expect(normalizeWhatsAppNumber(null)).toBeNull();
    expect(normalizeWhatsAppNumber(undefined)).toBeNull();
  });

  it("accepts exactly 8 digits", () => {
    expect(normalizeWhatsAppNumber("12345678")).toBe("12345678");
  });
});

describe("whatsAppUrl", () => {
  it("encodes the message", () => {
    expect(whatsAppUrl("6281234567890", "Halo & bayar")).toBe("https://wa.me/6281234567890?text=Halo%20%26%20bayar");
  });

  it("works without a number", () => {
    expect(whatsAppUrl(null, "x")).toBe("https://wa.me/?text=x");
  });
});

describe("whatsAppMessage", () => {
  const base = {
    clientName: "PT Maju Jaya",
    number: "INV-2026-0007",
    businessName: "Studio Donny",
    total: "Rp 1.500.000",
    dueDate: "4 November 2026",
    url: "https://app.example/i/abc",
  };

  it("writes the Indonesian message", () => {
    expect(whatsAppMessage({ ...base, language: "id" })).toBe(
      "Halo PT Maju Jaya, berikut invoice INV-2026-0007 dari Studio Donny sebesar Rp 1.500.000, jatuh tempo 4 November 2026. Lihat & bayar di sini: https://app.example/i/abc",
    );
  });

  it("writes the English message", () => {
    expect(
      whatsAppMessage({ ...base, language: "en", total: "$1,500.00", dueDate: "November 4, 2026" }),
    ).toBe(
      "Hi PT Maju Jaya, here is invoice INV-2026-0007 from Studio Donny for $1,500.00, due November 4, 2026. View and pay here: https://app.example/i/abc",
    );
  });
});
