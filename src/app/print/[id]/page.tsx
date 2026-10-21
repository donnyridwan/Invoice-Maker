import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildInvoiceDocument } from "@/documents/build-document";
import { InvoiceDocumentView } from "@/documents/invoice-document-view";
import { documentSourceFromInvoice } from "@/features/invoices/document-source";
import { getInvoiceForPrint } from "@/features/invoices/queries";
import { verifyPrintSignature } from "@/lib/signed-url";

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

// A4 pages with no margin (the templates set their own padding); `min-height: 0` keeps the
// app's `min-h-screen` body from pushing a blank second page.
const PRINT_CSS = "@page { size: A4; margin: 0 } html, body { min-height: 0; background: #fff }";

type Search = { exp?: string | string[]; sig?: string | string[] };

const single = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

/**
 * The page headless Chromium prints to make a PDF: just the invoice document, no app shell. It has
 * no session, so the only way in is a signature made by `signPrintPath` (valid for 60 seconds).
 * Anything else (no or wrong signature, expired, unknown invoice) is a plain 404.
 */
export default async function PrintInvoicePage({ params, searchParams }: PageProps<"/print/[id]">) {
  const { id } = await params;
  const { exp, sig } = (await searchParams) as Search;
  if (!verifyPrintSignature(id, single(exp), single(sig))) notFound();

  const invoice = await getInvoiceForPrint(id);
  if (!invoice) notFound();

  return (
    <>
      <style>{PRINT_CSS}</style>
      <InvoiceDocumentView doc={buildInvoiceDocument(documentSourceFromInvoice(invoice))} />
    </>
  );
}
