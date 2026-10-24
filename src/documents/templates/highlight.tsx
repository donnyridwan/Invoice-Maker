import { Fragment } from "react";
import { clientLines, itemQuantity, Logo, type TemplateProps } from "./shared";

// Sizes are Figma pixels on the 595 × 842 A4 frame, which are points on the page.
const caps = "text-[8pt] leading-[12pt] font-semibold tracking-[0.32pt] uppercase text-[#5E6470]";

/** Purple on a light accent (the lime the design uses), white on a dark one. */
function amountColor(hex: string): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return "#6735F4";
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => parseInt(part, 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.65 ? "#6735F4" : "#FFFFFF";
}

/**
 * A grey "Invoice" title, the dates centred between the client and the amount due on an
 * accent-coloured tab running off the page edge, a numbered item list and, at the foot, a
 * thank-you line over the payment info. A faint paper grain covers the page.
 */
export function HighlightTemplate({ doc }: TemplateProps) {
  const L = doc.labels;
  const contact = [doc.business.email, doc.business.phone].filter(Boolean);
  const address = doc.business.address?.split("\n").join(", ");

  return (
    <div className="relative flex min-h-[842pt] flex-col px-[40pt] pt-[32pt] pb-[32pt] font-doc text-[#1A1C21]">
      {/* The grain, twice (the second turned over) as in the design. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/noise.png" alt="" aria-hidden className="pointer-events-none absolute inset-0 size-full" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/templates/noise.png" alt="" aria-hidden className="pointer-events-none absolute inset-0 size-full rotate-180" />

      <header className="relative flex items-start justify-between gap-[20pt]">
        <div className="flex items-start gap-[20pt]">
          <Logo business={doc.business} className="size-[48pt] object-contain" />
          <div className="flex flex-col gap-[2pt]">
            <p className="text-[18pt] leading-[24pt] font-bold">{doc.business.businessName}</p>
            {contact.map((line) => (
              <p key={line} className="text-[10pt] leading-[14pt] font-medium text-[#5E6470]">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-[6pt] text-right font-doc-display">
          <p className="text-[36pt] leading-[40pt] font-semibold tracking-[-1.08pt] text-[#B2B7C2] [text-box:trim-both_cap_alphabetic]">
            {L.invoice}
          </p>
          <p className="text-[12pt] leading-[16pt] font-medium tracking-[0.24pt] text-[#5E6470]">{doc.number}</p>
        </div>
      </header>

      <section className="relative mt-[48pt] flex items-start justify-between">
        <div className="flex max-w-[180pt] flex-col gap-[2pt]">
          <p className={`${caps} leading-[14pt]`}>{L.billTo}</p>
          {doc.client ? (
            <>
              <p className="text-[10pt] leading-[14pt] font-semibold">{doc.client.name}</p>
              {clientLines(doc.client).map((line) => (
                <p key={line} className="text-[10pt] leading-[14pt] whitespace-pre-line text-[#5E6470]">
                  {line}
                </p>
              ))}
            </>
          ) : (
            <p className="text-[10pt] leading-[14pt] text-[#5E6470]">—</p>
          )}
        </div>
        {/* The dates, centred on the page. */}
        <div className="absolute top-0 left-1/2 flex -translate-x-1/2 flex-col items-center gap-[20pt] text-center font-semibold whitespace-nowrap">
          <div className="flex flex-col gap-[2pt]">
            <p className={caps}>{L.issueDate}</p>
            <p className="text-[10pt] leading-[14pt]">{doc.issueDateNumeric.replaceAll("/", ".")}</p>
          </div>
          <div className="flex flex-col gap-[2pt]">
            <p className={caps}>{L.dueDate}</p>
            <p className="text-[10pt] leading-[14pt]">{doc.dueDateNumeric.replaceAll("/", ".")}</p>
          </div>
        </div>
        <div className="mt-[28pt] -mr-[40pt] flex flex-col items-end gap-[4pt]">
          <p className={`${caps} mr-[40pt] text-right`}>{L.amountDue}</p>
          <p
            className="py-[6pt] pr-[40pt] pl-[12pt] text-right text-[14pt] leading-[20pt] font-bold tracking-[-0.14pt] whitespace-nowrap"
            style={{ backgroundColor: doc.accentColor, color: amountColor(doc.accentColor) }}
          >
            {doc.total}
          </p>
        </div>
      </section>

      <section className="relative mt-[48pt]">
        <div className="flex pb-[8pt]">
          <p className={`${caps} w-[20pt] shrink-0`}>#</p>
          <p className={`${caps} flex-1`}>{L.titleDescription}</p>
          <p className={`${caps} text-right`}>{L.subtotal}</p>
        </div>
        <div className="h-[1pt] bg-[#D7DAE0]" />
        {doc.items.map((item, index) => (
          <div
            key={index}
            className="relative flex py-[8pt] break-inside-avoid before:absolute before:top-0 before:right-0 before:left-[20pt] before:h-[0.5pt] before:bg-[#D7DAE0] first-of-type:before:hidden"
          >
            <p className="w-[20pt] shrink-0 text-[10pt] leading-[14pt] font-medium">{index + 1}</p>
            <div className="min-w-0 flex-1 pr-[12pt]">
              <p className="text-[10pt] leading-[14pt] font-semibold">{item.name}</p>
              <div className="mt-[4pt] flex flex-wrap items-start gap-x-[6pt] text-[10pt] leading-[14pt] text-[#5E6470] empty:hidden">
                {/* The description's lines (and "qty × price" when it is not a single unit), dot-separated. */}
                {[
                  ...(item.quantity !== "1" || item.unit ? [`${itemQuantity(item)} × ${item.unitPrice}`] : []),
                  ...item.description.split("\n").filter(Boolean),
                ].map((part, partIndex) => (
                  <Fragment key={partIndex}>
                    {partIndex > 0 && (
                      <span aria-hidden className="w-[3pt] text-center text-[12pt] leading-[14pt] font-light text-[#8B919E]">
                        •
                      </span>
                    )}
                    <span>{part}</span>
                  </Fragment>
                ))}
              </div>
            </div>
            <p className="text-right text-[10pt] leading-[14pt] font-medium whitespace-nowrap text-[#5E6470]">{item.amount}</p>
          </div>
        ))}
        <div className="h-[1pt] bg-[#D7DAE0]" />

        <div className="mt-[12pt] flex flex-col gap-[6pt] break-inside-avoid text-[10pt] leading-[14pt]">
          {doc.discount && (
            <>
              <div className="flex justify-between font-medium text-[#5E6470]">
                <span>{L.subtotal}</span>
                <span className="whitespace-nowrap">{doc.subtotal}</span>
              </div>
              <div className="flex justify-between font-medium text-[#5E6470]">
                <span>{doc.discountLabel}</span>
                <span className="whitespace-nowrap">−{doc.discount}</span>
              </div>
            </>
          )}
          <div className="flex justify-between font-bold">
            <span>{L.total}</span>
            <span className="whitespace-nowrap">{doc.total}</span>
          </div>
        </div>

        {doc.notes && (
          <div className="mt-[6pt] flex items-start gap-[6pt] break-inside-avoid">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/templates/quote.svg" alt="" aria-hidden width={10} height={14} className="h-[14pt] w-[10pt] shrink-0" />
            <p className="text-[10pt] leading-[14pt] whitespace-pre-line text-[#5E6470]">{doc.notes}</p>
          </div>
        )}
      </section>

      <footer className="relative mt-auto pt-[24pt] break-inside-avoid">
        <p className="text-[10pt] leading-[14pt] font-semibold text-[#5E6470]">{L.thanks}</p>
        {doc.paymentAccounts.length > 0 && (
          <>
            <div className="mt-[24pt] flex items-center gap-[6pt]">
              <p className={caps}>{L.paymentInfo}</p>
              <span className="h-[0.5pt] flex-1 bg-[#D7DAE0]" />
            </div>
            {doc.paymentAccounts.map((account, index) => {
              // The holder (or the account's own name) heads the row, over the business address.
              const holder = account.lines.find((line) => line.key === "accountName");
              const heading = account.title || holder?.value || "";
              const columns = account.lines.filter((line) => line !== holder || account.title);
              return (
                <div key={index} className="mt-[12pt] flex items-center gap-[12pt]">
                  <div className="min-w-0 flex-1">
                    <p className="text-[8pt] leading-[12pt] font-semibold tracking-[0.32pt] uppercase">{heading}</p>
                    {address && (
                      <p className="text-[8pt] leading-[12pt] font-medium tracking-[0.08pt] text-[#5E6470]">{address}</p>
                    )}
                  </div>
                  {columns.map((line, lineIndex) => (
                    <Fragment key={line.key}>
                      {lineIndex > 0 && <span aria-hidden className="h-[20pt] w-[0.5pt] shrink-0 bg-[#D7DAE0]" />}
                      <div className="shrink-0 text-[8pt] leading-[12pt]">
                        <p className="font-medium tracking-[0.08pt]">{line.label}</p>
                        <p className="font-semibold tracking-[0.32pt] whitespace-pre-line text-[#5E6470]">{line.value}</p>
                      </div>
                    </Fragment>
                  ))}
                </div>
              );
            })}
          </>
        )}
      </footer>
    </div>
  );
}
