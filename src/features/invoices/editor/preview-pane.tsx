"use client";

import { useTranslations } from "next-intl";
import { InvoiceDocumentView } from "@/documents/invoice-document-view";
import { ScaledDocument } from "@/documents/scaled-document";
import type { InvoiceDocument } from "@/documents/types";

/** The A4 document, scaled to the pane, on the subtle grey canvas. */
export function PreviewPane({ doc }: { doc: InvoiceDocument }) {
  const t = useTranslations("invoices.editor");

  return (
    <section aria-label={t("previewLabel")} className="rounded-panel bg-subtle p-3 sm:p-6">
      <div className="mx-auto max-w-[794px] overflow-hidden rounded-md bg-white shadow-[0_2px_8px_rgba(14,15,12,0.08),0_0_0_1px_rgba(14,15,12,0.04)]">
        <ScaledDocument>
          <InvoiceDocumentView doc={doc} />
        </ScaledDocument>
      </div>
    </section>
  );
}
