/** `<number>.pdf` with anything outside `[A-Za-z0-9._-]` replaced by `-` ("INV/2026 7" -> "INV-2026-7.pdf"). */
export function pdfFilename(invoiceNumber: string): string {
  const safe = invoiceNumber.trim().replace(/[^A-Za-z0-9._-]/g, "-");
  return `${safe || "invoice"}.pdf`;
}

/** The download response for a rendered PDF. `no-store`: it reflects the invoice as it is now. */
export function pdfResponse(pdf: Uint8Array, invoiceNumber: string): Response {
  // Copy into a fresh ArrayBuffer-backed view: a Response body must not be a SharedArrayBuffer view.
  const body = new Uint8Array(pdf);
  return new Response(body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${pdfFilename(invoiceNumber)}"`,
      "content-length": String(body.byteLength),
      "cache-control": "private, no-store",
    },
  });
}
