import { describe, expect, it } from "vitest";
import { pdfFilename, pdfResponse } from "@/lib/pdf/response";

describe("pdfFilename", () => {
  it("keeps a normal invoice number", () => {
    expect(pdfFilename("INV-2026-001")).toBe("INV-2026-001.pdf");
  });

  it("replaces every character outside [A-Za-z0-9._-] with a dash", () => {
    expect(pdfFilename('INV/2026 7"x\r\n')).toBe("INV-2026-7-x.pdf");
    expect(pdfFilename("a;b\\c é")).toBe("a-b-c--.pdf");
  });

  it("falls back to a name for an empty number", () => {
    expect(pdfFilename("  ")).toBe("invoice.pdf");
  });
});

describe("pdfResponse", () => {
  it("is an attachment with the PDF content type", async () => {
    const response = pdfResponse(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "INV-1");
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="INV-1.pdf"');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("%PDF");
  });
});
