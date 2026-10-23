"use client";

import { useTranslations } from "next-intl";
import { InvoiceDocumentView } from "@/documents/invoice-document-view";
import { ScaledDocument } from "@/documents/scaled-document";
import type { InvoiceDocument } from "@/documents/types";

/** The A4 document, scaled to the pane. */
export function PreviewPane({ doc }: { doc: InvoiceDocument }) {
  const t = useTranslations("invoices.editor");

  return (
    <section aria-label={t("previewLabel")} className="p-4 sm:p-6">
      <div className="mx-auto max-w-[794px] overflow-hidden rounded-md bg-white shadow-[0_1px_3px_rgba(10,10,10,0.08),0_0_0_1px_rgba(10,10,10,0.05)]">
        <ScaledDocument>
          <InvoiceDocumentView doc={doc} />
        </ScaledDocument>
      </div>
    </section>
  );
}
