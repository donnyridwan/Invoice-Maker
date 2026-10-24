import { businessLines, clientLines, itemQuantity, type TemplateProps } from "./shared";

// Sizes are Figma pixels on the 595 × 842 A4 frame, which are points on the page.
const caps = "text-[8pt] leading-[12pt] font-semibold tracking-[0.32pt] uppercase text-[#5E6470]";
const body = "text-[10pt] leading-[14pt]";

/**
 * A plain "Invoice" title; the dates, client and sender in three columns; the items hang off an
 * accent-coloured line, the payment details off a dark one at the foot of the page.
 */
export function LineTemplate({ doc }: TemplateProps) {
  const L = doc.labels;

  return (
    <div className="flex min-h-[842pt] flex-col px-[32pt] pt-[32pt] pb-[67pt] font-doc text-[#1A1C21]">
      <p className="font-sans text-[32pt] leading-[44pt] font-semibold [text-box:trim-both_cap_alphabetic]">{L.invoice}</p>

      <section className={`${body} mt-[33pt] grid grid-cols-[112pt_1fr_1fr] gap-x-[32pt]`}>
        <div className="flex flex-col gap-[2pt] whitespace-nowrap text-[#5E6470]">
          <p className="font-semibold">
            {L.dues} {doc.dueDateNumeric}
          </p>
          <p>
            {L.issued} {doc.issueDateNumeric}
          </p>
          <p>
            {L.ref} {doc.number}
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-[6pt]">
          <p className="font-semibold">{L.billTo}</p>
          <div className="flex flex-col gap-[2pt] text-[#5E6470]">
            {doc.client ? (
              <>
                <p className="font-semibold">{doc.client.name}</p>
                {clientLines(doc.client).map((line) => (
                  <p key={line} className="whitespace-pre-line">
                    {line}
                  </p>
                ))}
              </>
            ) : (
              <p>—</p>
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-[6pt]">
          <p className="font-semibold">{L.from}</p>
          <div className="flex flex-col gap-[2pt] text-[#5E6470]">
            <p className="font-semibold">{doc.business.businessName}</p>
            {businessLines(doc.business).map((line) => (
              <p key={line} className="whitespace-pre-line">
                {line}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* The items, 16pt right of a 2pt accent line that runs 15pt past them at both ends. */}
      <section
        className="mt-[81pt] ml-[128pt] flex flex-col gap-[16pt] border-l-[2pt] py-[15pt] pl-[14pt]"
        style={{ borderColor: doc.accentColor }}
      >
        {/* One grid for the header and the rows, so the figures line up whatever their width. */}
        <div className="grid grid-cols-[1fr_minmax(18pt,auto)_minmax(64pt,auto)_minmax(64pt,auto)] gap-x-[24pt] gap-y-[16pt]">
          <div className={`${caps} col-span-4 grid grid-cols-subgrid`}>
            <p className="min-w-0">{L.itemDescription}</p>
            <p className="text-center">{L.quantity}</p>
            <p className="text-right">{L.rate}</p>
            <p className="text-right">{L.amount}</p>
          </div>
          {doc.items.map((item, index) => (
            <div key={index} className={`${body} col-span-4 grid grid-cols-subgrid break-inside-avoid`}>
              <div className="min-w-0">
                <p className="font-semibold">{item.name}</p>
                {item.description && <p className="mt-[2pt] whitespace-pre-line text-[#5E6470]">{item.description}</p>}
              </div>
              <p className="text-center font-medium whitespace-nowrap">{itemQuantity(item)}</p>
              <p className="text-right font-medium whitespace-nowrap">{item.unitPrice}</p>
              <p className="text-right font-medium whitespace-nowrap">{item.amount}</p>
            </div>
          ))}
        </div>
        <div className="h-[1pt] bg-[#D7DAE0]" />
        <div className={`${body} flex items-center justify-between break-inside-avoid`}>
          <p className="font-semibold text-[#5E6470]">{L.subtotal}</p>
          <p className="text-right font-medium whitespace-nowrap">{doc.subtotal}</p>
        </div>
        {doc.discount && (
          <div className={`${body} flex items-center justify-between break-inside-avoid`}>
            <p className="font-semibold text-[#5E6470]">{doc.discountLabel}</p>
            <p className="text-right font-medium whitespace-nowrap">−{doc.discount}</p>
          </div>
        )}
        <div className="h-[0.5pt] bg-[#D7DAE0]" />
        <div className="flex items-center justify-between text-[12pt] leading-[16pt] font-bold whitespace-nowrap break-inside-avoid">
          <p className="flex gap-[2pt]">
            <span>{L.total}</span>
            <span className="text-[#5E6470]">({doc.currency})</span>
          </p>
          <p className="text-right" style={{ color: doc.accentColor }}>
            {doc.total}
          </p>
        </div>
      </section>

      {(doc.paymentAccounts.length > 0 || doc.terms) && (
        <footer
          className={`${body} mt-auto ml-[128pt] grid grid-cols-[169pt_1fr] gap-x-[24pt] border-l-[2pt] border-[#5E6470] py-[7pt] pl-[14pt] break-inside-avoid`}
        >
          <div>
            <p className="font-semibold">{doc.paymentAccounts.length > 0 ? L.paymentDetails : L.terms}</p>
            {doc.terms && <p className="mt-[2pt] whitespace-pre-line text-[#5E6470]">{doc.terms}</p>}
          </div>
          <div className="flex flex-col gap-[8pt]">
            {doc.paymentAccounts.map((account, index) => (
              <dl key={index} className="flex flex-col gap-[2pt] font-medium">
                {account.title && !account.lines.some((line) => line.value === account.title) && (
                  <p className="font-semibold">{account.title}</p>
                )}
                {account.lines.map((line) => (
                  <div key={line.key} className="flex justify-between gap-[12pt]">
                    <dt>{line.label}</dt>
                    <dd className="text-right whitespace-pre-line text-[#5E6470]">{line.value}</dd>
                  </div>
                ))}
              </dl>
            ))}
          </div>
        </footer>
      )}
    </div>
  );
}
