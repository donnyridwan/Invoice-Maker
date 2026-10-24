import { describe, expect, it } from "vitest";
import {
  applyCatalogItem,
  editorStateFromInvoice,
  filterCatalogOptions,
  type CatalogOption,
  evaluateEditor,
  mapServerErrors,
  newEditorItem,
  toDraftInput,
  toPreviewSource,
  type EditorState,
} from "@/features/invoices/editor-state";
import type { InvoiceWithItems } from "@/features/invoices/queries";

function invoice(overrides: Partial<InvoiceWithItems> = {}): InvoiceWithItems {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    userId: "u1",
    clientId: "00000000-0000-4000-8000-0000000000c1",
    number: "INV-2026-001",
    status: "draft",
    currency: "IDR",
    language: "id",
    template: "line",
    accentColor: "#112233",
    issueDate: "2026-10-21",
    dueDate: "2026-11-04",
    clientSnapshot: { name: "PT Acme" },
    businessSnapshot: { businessName: "Studio Donny" },
    paymentAccountsSnapshot: [
      { id: "00000000-0000-4000-8000-0000000000a1", type: "bank", label: "", details: {}, currency: null },
    ],
    discountType: "percent",
    discountValue: 1250,
    subtotalMinor: 3_300_000,
    discountMinor: 412_500,
    totalMinor: 2_887_500,
    notes: "Terima kasih",
    publicToken: "tok",
    sentAt: null,
    firstViewedAt: null,
    paidAt: null,
    paidNote: null,
    voidedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    items: [
      {
        id: "00000000-0000-4000-8000-0000000000b1",
        invoiceId: "00000000-0000-4000-8000-000000000001",
        position: 0,
        name: "Desain logo",
        description: "Tiga konsep",
        quantityMilli: 2000,
        unit: "proyek",
        unitPriceMinor: 1_500_000,
        amountMinor: 3_000_000,
      },
      {
        id: "00000000-0000-4000-8000-0000000000b2",
        invoiceId: "00000000-0000-4000-8000-000000000001",
        position: 1,
        name: "Revisi",
        description: null,
        quantityMilli: 1500,
        unit: null,
        unitPriceMinor: 200_000,
        amountMinor: 300_000,
      },
    ],
    ...overrides,
  } as InvoiceWithItems;
}

function state(overrides: Partial<EditorState> = {}): EditorState {
  return { ...editorStateFromInvoice(invoice(), "id"), ...overrides };
}

function item(fields: Partial<ReturnType<typeof newEditorItem>>) {
  return { ...newEditorItem("k"), name: "", quantity: "", unitPrice: "", ...fields };
}

describe("toDraftInput", () => {
  it("parses Indonesian quantity and price into milli-units and minor units", () => {
    const result = toDraftInput(state({ items: [item({ name: "Revisi", quantity: "1,5", unitPrice: "200.000" })] }), "id");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.items).toHaveLength(1);
    expect(result.input.items[0]).toMatchObject({ name: "Revisi", quantityMilli: 1500, unitPriceMinor: 200_000 });
  });

  it("reads numbers in the UI locale (en) and USD cents", () => {
    const result = toDraftInput(
      state({ currency: "USD", items: [item({ name: "Design", quantity: "1.5", unitPrice: "1,200.50" })] }),
      "en",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.items[0]).toMatchObject({ quantityMilli: 1500, unitPriceMinor: 120_050 });
  });

  it("drops rows whose fields are all empty (including the untouched default quantity)", () => {
    const result = toDraftInput(
      state({
        items: [
          item({ name: "Desain", quantity: "1", unitPrice: "100.000" }),
          item({}),
          { ...newEditorItem("k2"), name: "", unitPrice: "" },
        ],
      }),
      "id",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.items.map((i) => i.name)).toEqual(["Desain"]);
  });

  it("reports an invalid price at items.<i>.unitPrice", () => {
    const result = toDraftInput(state({ items: [item({ name: "Desain", quantity: "1", unitPrice: "abc" })] }), "id");
    expect(result).toMatchObject({ ok: false, errors: { "items.0.unitPrice": "invalidAmount" } });
  });

  it("reports an invalid or empty quantity at items.<i>.quantity", () => {
    const bad = toDraftInput(state({ items: [item({ name: "A", quantity: "1,5555", unitPrice: "1" })] }), "id");
    expect(bad).toMatchObject({ ok: false, errors: { "items.0.quantity": "invalidNumber" } });
    const empty = toDraftInput(state({ items: [item({ name: "A", quantity: "", unitPrice: "1" })] }), "id");
    expect(empty).toMatchObject({ ok: false, errors: { "items.0.quantity": "required" } });
  });

  it("keys item errors by the row's position in the editor, even when blank rows are dropped", () => {
    const result = toDraftInput(
      state({
        items: [item({}), item({ name: "A", quantity: "1", unitPrice: "1" }), item({ name: "B", quantity: "x", unitPrice: "1" })],
      }),
      "id",
    );
    expect(result).toMatchObject({ ok: false, errors: { "items.2.quantity": "invalidNumber" } });
  });

  it("treats an empty price on a named row as zero", () => {
    const result = toDraftInput(state({ items: [item({ name: "Gratis", quantity: "1", unitPrice: "" })] }), "id");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.items[0].unitPriceMinor).toBe(0);
  });

  it("parses a percent discount ('12,5' -> 1250 basis points) and a fixed amount", () => {
    const percent = toDraftInput(state({ discountType: "percent", discountValue: "12,5" }), "id");
    expect(percent.ok && percent.input).toMatchObject({ discountType: "percent", discountValue: 1250 });
    const fixed = toDraftInput(state({ discountType: "fixed", discountValue: "50.000" }), "id");
    expect(fixed.ok && fixed.input).toMatchObject({ discountType: "fixed", discountValue: 50_000 });
    const none = toDraftInput(state({ discountType: "none", discountValue: "garbage" }), "id");
    expect(none.ok && none.input).toMatchObject({ discountType: "none", discountValue: 0 });
  });

  it("flags an invalid discount value and a percent above 100", () => {
    expect(toDraftInput(state({ discountType: "percent", discountValue: "abc" }), "id")).toMatchObject({
      ok: false,
      errors: { discountValue: "invalidNumber" },
    });
    expect(toDraftInput(state({ discountType: "percent", discountValue: "101" }), "id")).toMatchObject({
      ok: false,
      errors: { discountValue: "invalidNumber" },
    });
  });

  it("blocks an amount that is too large to store", () => {
    const result = toDraftInput(
      state({ items: [item({ name: "A", quantity: "999999", unitPrice: "9.000.000.000.000" })] }),
      "id",
    );
    expect(result).toMatchObject({ ok: false, errors: { _form: "amountTooLarge" } });
  });

  it("validates the number and the dates", () => {
    expect(toDraftInput(state({ number: "  " }), "id")).toMatchObject({ ok: false, errors: { number: "required" } });
    expect(toDraftInput(state({ number: "bad number!" }), "id")).toMatchObject({
      ok: false,
      errors: { number: "invalidNumber" },
    });
    expect(toDraftInput(state({ dueDate: "2026-10-01" }), "id")).toMatchObject({
      ok: false,
      errors: { dueDate: "dueBeforeIssue" },
    });
    expect(toDraftInput(state({ issueDate: "" }), "id")).toMatchObject({
      ok: false,
      errors: { issueDate: "invalidDate" },
    });
  });

  it("round-trips an invoice: editorStateFromInvoice then toDraftInput gives the stored values", () => {
    const inv = invoice();
    const result = toDraftInput(editorStateFromInvoice(inv, "id"), "id");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input).toEqual({
      clientId: inv.clientId,
      number: inv.number,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      currency: "IDR",
      language: "id",
      template: "line",
      accentColor: "#112233",
      discountType: "percent",
      discountValue: 1250,
      notes: "Terima kasih",
      paymentAccountIds: ["00000000-0000-4000-8000-0000000000a1"],
      items: [
        { name: "Desain logo", description: "Tiga konsep", quantityMilli: 2000, unit: "proyek", unitPriceMinor: 1_500_000 },
        { name: "Revisi", description: undefined, quantityMilli: 1500, unit: undefined, unitPriceMinor: 200_000 },
      ],
    });
  });

  it("round-trips in English and with two-decimal currencies", () => {
    const inv = invoice({
      currency: "USD",
      discountType: "fixed",
      discountValue: 123_456,
      items: invoice().items.map((i) => ({ ...i, unitPriceMinor: 123_456_789 })),
    });
    const result = toDraftInput(editorStateFromInvoice(inv, "en"), "en");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.discountValue).toBe(123_456);
    expect(result.input.items.map((i) => i.unitPriceMinor)).toEqual([123_456_789, 123_456_789]);
  });
});

describe("editorStateFromInvoice", () => {
  it("formats quantities, prices and the discount for the locale", () => {
    const s = editorStateFromInvoice(invoice(), "id");
    expect(s.items.map((i) => [i.quantity, i.unitPrice])).toEqual([
      ["2", "1.500.000"],
      ["1,5", "200.000"],
    ]);
    expect(s.discountValue).toBe("12,5");
    expect(s.items[0].key).toBe("00000000-0000-4000-8000-0000000000b1");
  });

  it("starts an invoice without items with one blank row", () => {
    const s = editorStateFromInvoice(invoice({ items: [], discountType: "none", discountValue: 0 }), "id");
    expect(s.items).toHaveLength(1);
    expect(s.discountValue).toBe("");
    const result = toDraftInput(s, "id");
    expect(result.ok && result.input.items).toEqual([]);
  });
});

describe("mapServerErrors", () => {
  it("maps server item paths back to editor rows and renames the money fields", () => {
    const s = state({ items: [item({}), item({ name: "A", quantity: "1", unitPrice: "1" }), item({ name: "B", quantity: "1", unitPrice: "1" })] });
    expect(
      mapServerErrors(s, {
        number: ["duplicateNumber"],
        "items.1.name": ["tooLong:200"],
        "items.0.quantityMilli": ["invalidNumber"],
        _form: ["invoiceLocked"],
      }),
    ).toEqual({
      number: "duplicateNumber",
      "items.2.name": "tooLong:200",
      "items.1.quantity": "invalidNumber",
      _form: "invoiceLocked",
    });
  });
});

describe("evaluateEditor and toPreviewSource", () => {
  const ctx = {
    business: { businessName: "Studio Donny" },
    clients: [{ id: "00000000-0000-4000-8000-0000000000c1", name: "PT Acme", email: "a@acme.com" }],
    accounts: [
      { id: "00000000-0000-4000-8000-0000000000a1", type: "bank", label: "BCA", details: {}, currency: null },
      { id: "00000000-0000-4000-8000-0000000000a2", type: "bank", label: "Mandiri", details: {}, currency: null },
    ],
    status: "draft",
  };

  it("computes line amounts and totals", () => {
    const e = evaluateEditor(editorStateFromInvoice(invoice(), "id"), "id");
    expect(e.rows.map((r) => r.amountMinor)).toEqual([3_000_000, 300_000]);
    expect(e).toMatchObject({ subtotalMinor: 3_300_000, discountMinor: 412_500, totalMinor: 2_887_500 });
  });

  it("counts invalid quantities and prices as zero so the preview keeps rendering", () => {
    const s = state({
      discountType: "none",
      items: [item({ name: "A", quantity: "2", unitPrice: "100" }), item({ name: "B", quantity: "x", unitPrice: "abc" })],
    });
    const e = evaluateEditor(s, "id");
    expect(e.rows.map((r) => r.amountMinor)).toEqual([200, null]);
    expect(e.totalMinor).toBe(200);
    const src = toPreviewSource(s, ctx, "id");
    expect(src.items.map((i) => i.amountMinor)).toEqual([200, 0]);
    expect(src.totalMinor).toBe(200);
  });

  it("falls back to zero totals when an amount overflows", () => {
    const s = state({ items: [item({ name: "A", quantity: "999999", unitPrice: "9.000.000.000.000" })] });
    expect(evaluateEditor(s, "id").totalMinor).toBe(0);
    expect(() => toPreviewSource(s, ctx, "id")).not.toThrow();
  });

  it("builds a source from the selected client and accounts, tolerating invalid dates", () => {
    const s = state({
      issueDate: "",
      dueDate: "garbage",
      language: "en",
      paymentAccountIds: ["00000000-0000-4000-8000-0000000000a2"],
    });
    const src = toPreviewSource(s, ctx, "id");
    expect(src.client).toEqual({ name: "PT Acme", email: "a@acme.com" });
    expect(src.paymentAccounts.map((a) => a.label)).toEqual(["Mandiri"]);
    expect(src.language).toBe("en");
    expect(src.number).toBe("INV-2026-001");
    expect(src.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(src.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(toPreviewSource(state({ clientId: null }), ctx, "id").client).toBeNull();
  });
});

const catalog = (overrides: Partial<CatalogOption> & { name: string }): CatalogOption => ({
  id: overrides.name,
  description: null,
  unit: null,
  unitPriceMinor: 0,
  currency: "IDR",
  ...overrides,
});

describe("filterCatalogOptions", () => {
  const options = [
    catalog({ name: "Desain logo" }),
    catalog({ name: "Revisi desain" }),
    catalog({ name: "Hosting" }),
    ...Array.from({ length: 10 }, (_, i) => catalog({ name: `Desa ${i}` })),
  ];

  it("returns nothing for an empty query", () => {
    expect(filterCatalogOptions(options, "")).toEqual([]);
    expect(filterCatalogOptions(options, "   ")).toEqual([]);
  });

  it("matches names case-insensitively, names starting with the query first", () => {
    expect(filterCatalogOptions(options, "DESAIN").map((o) => o.name)).toEqual(["Desain logo", "Revisi desain"]);
    expect(filterCatalogOptions(options, "host").map((o) => o.name)).toEqual(["Hosting"]);
  });

  it("returns at most 8 items", () => {
    expect(filterCatalogOptions(options, "desa")).toHaveLength(8);
  });
});

describe("applyCatalogItem", () => {
  const item = catalog({ name: "Desain logo", description: "Tiga konsep", unit: "proyek", unitPriceMinor: 1500000 });

  it("fills name, description, unit and the price when the currencies match", () => {
    expect(applyCatalogItem(item, "IDR", "id")).toEqual({
      patch: { name: "Desain logo", description: "Tiga konsep", unit: "proyek", unitPrice: "1.500.000" },
      priceCurrency: null,
    });
  });

  it("leaves the price alone and reports the catalog currency when they differ", () => {
    const usd = catalog({ name: "Consulting", unit: "jam", unitPriceMinor: 12500, currency: "USD" });
    expect(applyCatalogItem(usd, "IDR", "id")).toEqual({
      patch: { name: "Consulting", description: "", unit: "jam" },
      priceCurrency: "USD",
    });
  });

  it("formats the price for the UI locale", () => {
    const usd = catalog({ name: "Consulting", unitPriceMinor: 12550, currency: "USD" });
    expect(applyCatalogItem(usd, "USD", "en").patch.unitPrice).toBe("125.50");
  });
});
