"use client";

import { useTranslations } from "next-intl";
import { InvoiceDocumentView } from "@/documents/invoice-document-view";
import { ScaledDocument } from "@/documents/scaled-document";
import type { InvoiceDocument } from "@/documents/types";

/** The A4 document, scaled to the pane, on the subtle grey canvas. */
export function PreviewPane({ doc }: { doc: InvoiceDocument }) {
  const t = useTranslations("invoices.editor");

  return (
    <section aria-label={t("previewLabel")} className="rounded-lg bg-subtle p-3 sm:p-5">
      <div className="mx-auto max-w-[794px] overflow-hidden rounded-sm bg-white shadow-[0_1px_3px_rgba(26,31,54,0.12),0_0_0_1px_rgba(26,31,54,0.04)]">
        <ScaledDocument>
          <InvoiceDocumentView doc={doc} />
        </ScaledDocument>
      </div>
    </section>
  );
}
