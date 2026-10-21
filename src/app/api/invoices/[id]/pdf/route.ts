import { notFound } from "next/navigation";
import { getInvoice } from "@/features/invoices/queries";
import { NotFoundError } from "@/lib/errors";
import { renderInvoicePdf } from "@/lib/pdf/render";
import { pdfResponse } from "@/lib/pdf/response";
import { requireUser } from "@/lib/session";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** Owner download: the invoice as a PDF, in any status. Opening it changes nothing. */
export async function GET(_request: Request, { params }: RouteContext<"/api/invoices/[id]/pdf">) {
  const user = await requireUser();
  const { id } = await params;

  const invoice = await getInvoice(user.id, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  return pdfResponse(await renderInvoicePdf(invoice.id), invoice.number);
}
