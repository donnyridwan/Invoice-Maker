import type { CSSProperties } from "react";
import type { InvoiceDocument } from "./types";
import { TEMPLATE_COMPONENTS } from "./templates";

/**
 * One A4 page (210 x 297 mm) rendered with the invoice's template. Pure and server-renderable:
 * used by the editor preview (inside `ScaledDocument`), the public page and the print route.
 */
export function InvoiceDocumentView({ doc }: { doc: InvoiceDocument }) {
  const Template = TEMPLATE_COMPONENTS[doc.template];

  return (
    <article
      data-template={doc.template}
      lang={doc.language}
      className="invoice-page relative box-border min-h-[297mm] w-[210mm] bg-white font-sans text-[9pt] leading-[1.45] text-fg"
      style={{ "--accent": doc.accentColor } as CSSProperties}
    >
      <Template doc={doc} />
      {doc.paid && (
        <div
          aria-hidden
          className="pointer-events-none absolute top-[37mm] right-[16mm] -rotate-[8deg] rounded-[1.2mm] border-[0.55mm] border-badge-success-fg bg-white/85 px-[3.2mm] py-[0.8mm] text-[12pt] font-bold tracking-[0.18em] text-badge-success-fg opacity-90"
        >
          {doc.labels.paid}
        </div>
      )}
    </article>
  );
}
