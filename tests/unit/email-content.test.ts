import { describe, expect, it } from "vitest";
import { defaultInvoiceEmail } from "@/features/invoices/email-content";

const base = {
  number: "INV-2026-0007",
  businessName: "Studio Donny",
  clientName: "PT Maju Jaya",
  total: "Rp 1.500.000",
  dueDate: "4 November 2026",
};

describe("defaultInvoiceEmail", () => {
  it("writes the Indonesian subject and message", () => {
    expect(defaultInvoiceEmail({ ...base, language: "id" })).toEqual({
      subject: "Invoice INV-2026-0007 dari Studio Donny",
      message:
        "Halo PT Maju Jaya,\n\nBerikut invoice INV-2026-0007 sebesar Rp 1.500.000, jatuh tempo 4 November 2026.\n\nTerima kasih,\nStudio Donny",
    });
  });

  it("writes the English subject and message", () => {
    expect(
      defaultInvoiceEmail({ ...base, language: "en", total: "$1,500.00", dueDate: "November 4, 2026" }),
    ).toEqual({
      subject: "Invoice INV-2026-0007 from Studio Donny",
      message:
        "Hi PT Maju Jaya,\n\nPlease find invoice INV-2026-0007 for $1,500.00, due November 4, 2026.\n\nThank you,\nStudio Donny",
    });
  });
});
