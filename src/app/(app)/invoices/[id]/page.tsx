import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { buildInvoiceDocument } from "@/documents/build-document";
import { InvoiceDocumentView } from "@/documents/invoice-document-view";
import { ScaledDocument } from "@/documents/scaled-document";
import { DetailPanel } from "@/features/invoices/detail/detail-panel";
import { documentSourceFromInvoice } from "@/features/invoices/document-source";
import { listEvents } from "@/features/invoices/events";
import { getInvoice } from "@/features/invoices/queries";
import { getScheduleForInvoice } from "@/features/recurring/queries";
import { toScheduleView } from "@/features/recurring/schedule-summary";
import { listClaims } from "@/features/payment-claims/queries";
import { isEmailEnabled } from "@/lib/email";
import { isCurrencyCode } from "@/lib/currencies";
import { todayInJakarta } from "@/lib/dates";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/lib/session";

// Server actions called from this page (sending by email renders a PDF) may run up to 30 s.
export const maxDuration = 30;

/** Owner's view of an invoice that has left draft: the document, its status, actions, claims and activity. */
export default async function InvoiceDetailPage({ params }: PageProps<"/invoices/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const t = await getTranslations("invoices.detail");

  const loaded = await Promise.all([
    getInvoice(user.id, id),
    listEvents(user.id, id),
    listClaims(user.id, id),
    getScheduleForInvoice(user.id, id),
  ]).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const [invoice, events, claims, schedule] = loaded;
  // A draft has no status to manage yet: it is edited.
  if (invoice.status === "draft") redirect(`/invoices/${invoice.id}/edit`);

  const currency = isCurrencyCode(invoice.currency) ? invoice.currency : "IDR";
  const pending = claims.filter((claim) => claim.status === "pending");
  const payerNames = Object.fromEntries(claims.map((claim) => [claim.id, claim.payerName]));

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/invoices"
          aria-label={t("back")}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle text-fg hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-fg">{invoice.number}</h1>
      </div>

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
        <section aria-label={t("documentLabel")} className="min-w-0 rounded-panel bg-subtle p-3 sm:p-6 xl:flex-1">
          <div className="mx-auto max-w-[794px] overflow-hidden rounded-md bg-white shadow-[0_2px_8px_rgba(14,14,14,0.08),0_0_0_1px_rgba(14,14,14,0.04)]">
            <ScaledDocument>
              <InvoiceDocumentView doc={buildInvoiceDocument(documentSourceFromInvoice(invoice))} />
            </ScaledDocument>
          </div>
        </section>
        <aside className="xl:w-[360px] xl:shrink-0">
          <DetailPanel
            invoice={invoice}
            currency={currency}
            today={todayInJakarta()}
            now={new Date()}
            events={events}
            pendingClaims={pending.map((claim) => ({
              id: claim.id,
              payerName: claim.payerName,
              paidOn: claim.paidOn,
              amountMinor: claim.amountMinor,
              note: claim.note,
              proofUrl: claim.proofUrl,
            }))}
            payerNames={payerNames}
            emailEnabled={isEmailEnabled()}
            schedule={schedule ? toScheduleView(schedule) : null}
          />
        </aside>
      </div>
    </>
  );
}
