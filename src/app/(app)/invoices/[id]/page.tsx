import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
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
  const tNav = await getTranslations("nav");

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
    // A workspace like the editor: the document on the left, status, actions and activity in a
    // panel on the right; each scrolls on its own on wide screens.
    <div className="flex flex-col xl:h-screen">
      <header className="sticky top-12 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-white px-3 md:top-0 md:px-4">
        <Link
          href="/invoices"
          aria-label={t("back")}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <span aria-hidden className="hidden text-[13px] text-muted sm:inline">
          {tNav("invoices")}
        </span>
        <ChevronRight aria-hidden className="hidden size-3.5 shrink-0 text-muted sm:block" />
        <h1 className="min-w-0 truncate text-[13px] font-semibold text-fg">{invoice.number}</h1>
      </header>

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <section aria-label={t("documentLabel")} className="min-w-0 bg-sidebar p-4 sm:p-6 xl:flex-1 xl:overflow-y-auto">
          <div className="mx-auto max-w-[794px] overflow-hidden rounded-md bg-white shadow-[0_1px_3px_rgba(10,10,10,0.08),0_0_0_1px_rgba(10,10,10,0.05)]">
            <ScaledDocument>
              <InvoiceDocumentView doc={buildInvoiceDocument(documentSourceFromInvoice(invoice))} />
            </ScaledDocument>
          </div>
        </section>
        <aside className="border-t border-border bg-white xl:w-[400px] xl:shrink-0 xl:overflow-y-auto xl:border-l xl:border-t-0">
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
    </div>
  );
}
