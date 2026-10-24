import { describe, expect, it } from "vitest";
import { buildInvoiceDocument } from "@/documents/build-document";
import type { InvoiceDocumentSource } from "@/documents/types";

const nbsp = (s: string) => s.replace(/ /g, " ");

function source(overrides: Partial<InvoiceDocumentSource> = {}): InvoiceDocumentSource {
  return {
    number: "INV-2026-001",
    status: "draft",
    language: "id",
    template: "highlight",
    accentColor: "#5850EC",
    currency: "IDR",
    issueDate: "2026-10-21",
    dueDate: "2026-11-04",
    business: { businessName: "Studio Donny", address: "Jl. Merdeka 1\nJakarta" },
    client: { name: "PT Acme" },
    paymentAccounts: [],
    items: [{ name: "Desain", quantityMilli: 1500, unitPriceMinor: 200_000, amountMinor: 300_000 }],
    subtotalMinor: 300_000,
    discountType: "percent",
    discountValue: 1250,
    discountMinor: 37_500,
    totalMinor: 262_500,
    ...overrides,
  };
}

describe("buildInvoiceDocument", () => {
  it("formats items, discount label and labels in Indonesian", () => {
    const doc = buildInvoiceDocument(source());
    expect(doc.items[0].quantity).toBe("1,5");
    expect(nbsp(doc.items[0].amount)).toBe("Rp 300.000");
    expect(nbsp(doc.items[0].unitPrice)).toBe("Rp 200.000");
    expect(doc.discountLabel).toBe("Diskon (12,5%)");
    expect(nbsp(doc.discount!)).toBe("Rp 37.500");
    expect(nbsp(doc.total)).toBe("Rp 262.500");
    expect(doc.labels.billTo).toBe("Ditagihkan kepada");
    expect(doc.issueDate).toBe("21 Oktober 2026");
    expect(doc.dueDate).toBe("4 November 2026");
    expect(doc.paid).toBe(false);
  });

  it("uses English labels and the invoice currency", () => {
    const doc = buildInvoiceDocument(source({ language: "en", currency: "USD" }));
    expect(doc.labels.billTo).toBe("Billed to");
    expect(doc.total.startsWith("$")).toBe(true);
    expect(doc.discountLabel).toBe("Discount (12.5%)");
    expect(doc.items[0].quantity).toBe("1.5");
    expect(doc.issueDate).toBe("October 21, 2026");
  });

  it("says 'due on receipt' when the due date equals the issue date", () => {
    expect(buildInvoiceDocument(source({ dueDate: "2026-10-21" })).dueDate).toBe("Saat diterima");
    expect(buildInvoiceDocument(source({ dueDate: "2026-10-21", language: "en" })).dueDate).toBe("Due on receipt");
  });

  it("lists bank account lines unmasked, in a fixed order", () => {
    const doc = buildInvoiceDocument(
      source({
        paymentAccounts: [
          {
            id: "a",
            type: "bank",
            label: "",
            currency: null,
            details: { accountNumber: "1234567890", bankName: "BCA", accountName: "Donny" },
          },
        ],
      }),
    );
    expect(doc.paymentAccounts[0].lines).toEqual([
      { key: "bankName", label: "Bank", value: "BCA" },
      { key: "accountName", label: "Nama pemilik", value: "Donny" },
      { key: "accountNumber", label: "No. rekening", value: "1234567890" },
    ]);
  });

  it("titles a custom method by its name and lists its own rows before the instructions", () => {
    const doc = buildInvoiceDocument(
      source({
        paymentAccounts: [
          {
            id: "b",
            type: "other",
            label: "",
            currency: null,
            details: {
              methodName: "GoPay",
              field1Label: "Nomor HP",
              field1Value: "0812 3456 7890",
              field2Label: "Atas nama",
              field2Value: "Donny",
              instructions: "Kirim bukti transfer via WhatsApp",
            },
          },
        ],
      }),
    );
    expect(doc.paymentAccounts[0]).toEqual({
      title: "GoPay",
      lines: [
        { key: "field1", label: "Nomor HP", value: "0812 3456 7890" },
        { key: "field2", label: "Atas nama", value: "Donny" },
        { key: "instructions", label: "Instruksi", value: "Kirim bukti transfer via WhatsApp" },
      ],
    });
  });

  it("omits the discount when it is zero and flags paid invoices", () => {
    const doc = buildInvoiceDocument(
      source({ discountType: "none", discountValue: 0, discountMinor: 0, totalMinor: 300_000, status: "paid" }),
    );
    expect(doc.discount).toBeNull();
    expect(doc.paid).toBe(true);
  });

  it("uses a plain 'Diskon' label for fixed discounts and keeps notes and a missing client", () => {
    const doc = buildInvoiceDocument(
      source({ discountType: "fixed", discountValue: 10_000, discountMinor: 10_000, client: null, notes: "Terima kasih" }),
    );
    expect(doc.discountLabel).toBe("Diskon");
    expect(doc.client).toBeNull();
    expect(doc.notes).toBe("Terima kasih");
  });
});
