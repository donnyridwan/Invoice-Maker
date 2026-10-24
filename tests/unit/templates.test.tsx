import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildInvoiceDocument } from "@/documents/build-document";
import { InvoiceDocumentView } from "@/documents/invoice-document-view";
import { TEMPLATE_COMPONENTS } from "@/documents/templates";
import type { InvoiceDocumentSource } from "@/documents/types";
import { TEMPLATES } from "@/features/profile/schema";

function source(overrides: Partial<InvoiceDocumentSource> = {}): InvoiceDocumentSource {
  return {
    number: "INV-2026-042",
    status: "sent",
    language: "id",
    template: "highlight",
    accentColor: "#5850EC",
    currency: "IDR",
    issueDate: "2026-10-21",
    dueDate: "2026-11-04",
    business: { businessName: "Studio Donny", email: "halo@donny.test", address: "Jl. Merdeka 1\nJakarta" },
    client: { name: "PT Maju Jaya", email: "ap@maju.test" },
    paymentAccounts: [
      { id: "a", type: "bank", label: "", currency: null, details: { bankName: "BCA", accountName: "Donny", accountNumber: "1234567890" } },
    ],
    items: [
      { name: "Desain logo", description: "3 revisi", quantityMilli: 1000, unit: "paket", unitPriceMinor: 2_500_000, amountMinor: 2_500_000 },
      { name: "Konsultasi", quantityMilli: 1500, unitPriceMinor: 400_000, amountMinor: 600_000 },
    ],
    subtotalMinor: 3_100_000,
    discountType: "fixed",
    discountValue: 100_000,
    discountMinor: 100_000,
    totalMinor: 3_000_000,
    notes: "Terima kasih atas kerja samanya.",
    ...overrides,
  };
}

describe.each(TEMPLATES)("%s template", (template) => {
  const render = (overrides: Partial<InvoiceDocumentSource> = {}) =>
    renderToStaticMarkup(<InvoiceDocumentView doc={buildInvoiceDocument(source({ template, ...overrides }))} />);

  it("renders the invoice number, client, total and template marker", () => {
    const html = render();
    expect(html).toContain("INV-2026-042");
    expect(html).toContain("PT Maju Jaya");
    expect(html).toContain("Rp");
    expect(html).toContain("3.000.000");
    expect(html).toContain("1234567890");
    expect(html).toContain("Terima kasih atas kerja samanya.");
    expect(html).toContain(`data-template="${template}"`);
    expect(html).toContain('lang="id"');
    expect(html).not.toContain("LUNAS");
  });

  it("stamps LUNAS when paid", () => {
    expect(render({ status: "paid" })).toContain("LUNAS");
  });

  it("renders without client, discount, notes or payment accounts", () => {
    const html = render({
      client: null,
      discountType: "none",
      discountValue: 0,
      discountMinor: 0,
      totalMinor: 3_100_000,
      notes: undefined,
      paymentAccounts: [],
    });
    expect(html).toContain("INV-2026-042");
    expect(html).not.toContain("Cara pembayaran");
  });
});

describe("TEMPLATE_COMPONENTS", () => {
  it("has a component for every template", () => {
    expect(Object.keys(TEMPLATE_COMPONENTS).sort()).toEqual([...TEMPLATES].sort());
  });
});
