import { notFound } from "next/navigation";
import { getPublicInvoice } from "@/features/invoices/queries";
import { renderInvoicePdf } from "@/lib/pdf/render";
import { pdfResponse } from "@/lib/pdf/response";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * Client download: the PDF behind a share link, no session. A draft or unknown token is a 404 (as
 * on the page), and so is a void invoice: it was cancelled, there is nothing to pay. Unlike the page
 * it records no view, so a download never changes what the owner sees.
 */
export async function GET(_request: Request, { params }: RouteContext<"/i/[token]/pdf">) {
  const { token } = await params;
  const invoice = await getPublicInvoice(token);
  if (!invoice || invoice.status === "void") notFound();
  return pdfResponse(await renderInvoicePdf(invoice.id), invoice.number);
}
