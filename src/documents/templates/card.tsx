import { clientLines, itemQuantity, Logo, type TemplateProps } from "./shared";

// Sizes are Figma pixels on the 595 × 842 A4 frame, which are points on the page.
const body = "text-[10pt] leading-[14pt]";
const label = "text-[10pt] leading-[14pt] font-medium text-[#5E6470]";
const caps = "text-[8pt] leading-[12pt] font-medium tracking-[0.32pt] uppercase text-[#5E6470]";

/**
 * The sender over a light grey page, the invoice on a white rounded card (client, number, dates
 * and the total in the accent colour up top) and the notes under the card.
 */
export function CardTemplate({ doc }: TemplateProps) {
  const L = doc.labels;
  const accent = { color: doc.accentColor };
  const contact = [doc.business.email, doc.business.phone].filter(Boolean);
  const initial = doc.business.businessName.trim().charAt(0).toUpperCase();

  return (
    <div className="flex min-h-[842pt] flex-col bg-[#F9FAFC] px-[16pt] pt-[24pt] pb-[24pt] font-doc text-[#1A1C21]">
      <header className="flex min-h-[70pt] items-start justify-between gap-[20pt] px-[16pt]">
        <div className="flex items-start gap-[20pt]">
          {doc.business.logoUrl ? (
            <Logo business={doc.business} className="size-[48pt] object-contain" />
          ) : (
            <span
              aria-hidden
              className="w-[48pt] text-center font-doc-initial text-[64pt] leading-[48pt] [text-box:trim-both_cap_alphabetic]"
              style={accent}
            >
              {initial}
            </span>
          )}
          <div className="flex flex-col gap-[2pt]">
            <p className="text-[18pt] leading-[22pt] font-semibold" style={accent}>
              {doc.business.businessName}
            </p>
            {contact.map((line) => (
              <p key={line} className={`${body} text-[#5E6470]`}>
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className={`${body} mt-[26pt] flex flex-col items-end gap-[2pt] text-right text-[#5E6470]`}>
          {doc.business.address && <p className="whitespace-pre-line">{doc.business.address}</p>}
          {doc.business.taxId && (
            <p>
              {L.taxId} {doc.business.taxId}
            </p>
          )}
        </div>
      </header>

      <main className="mt-[24pt] flex flex-1 flex-col rounded-[12pt] border-[0.5pt] border-[#D7DAE0] bg-white px-[16pt] pt-[20pt] pb-[20pt]">
        <section className={`${body} grid grid-cols-[228pt_1fr_auto]`}>
          <div className="row-span-2 flex flex-col gap-[4pt]">
            <p className={label}>{L.billTo}</p>
            <div className="flex flex-col gap-[2pt]">
              {doc.client ? (
                <>
                  <p className="font-semibold">{doc.client.name}</p>
                  {clientLines(doc.client).map((line) => (
                    <p key={line} className="whitespace-pre-line text-[#5E6470]">
                      {line}
                    </p>
                  ))}
                </>
              ) : (
                <p className="text-[#5E6470]">—</p>
              )}
            </div>
          </div>
          <div className="flex min-h-[112pt] flex-col gap-[4pt]">
            <p className={label}>{L.invoiceNumber}</p>
            <p className="font-semibold">{doc.number}</p>
          </div>
          <div className="flex flex-col items-end gap-[2pt] text-right">
            <p className={label}>
              {L.invoiceOf} ({doc.currency})
            </p>
            <p className="text-[20pt] leading-[28pt] font-bold whitespace-nowrap" style={accent}>
              {doc.total}
            </p>
          </div>
          <div className="col-start-2 flex flex-col gap-[4pt]">
            <p className={label}>{L.issueDate}</p>
            <p className="font-semibold">{doc.issueDateShort}</p>
          </div>
          <div className="flex flex-col items-end gap-[4pt] text-right">
            <p className={label}>{L.dueDate}</p>
            <p className="font-semibold whitespace-nowrap">{doc.dueDateShort}</p>
          </div>
        </section>

        {/* The items: description, then qty from 291pt, a 80pt rate and a 100pt amount 20pt apart. */}
        <div className="mt-[24pt] grid grid-cols-[1fr_40pt_80pt_120pt]">
          <div className="col-span-4 h-[0.5pt] bg-[#D7DAE0]" />
          <p className={`${caps} py-[8pt]`}>{L.itemDetail}</p>
          <p className={`${caps} py-[8pt]`}>{L.quantity}</p>
          <p className={`${caps} py-[8pt] text-right`}>{L.rate}</p>
          <p className={`${caps} py-[8pt] text-right`}>{L.amount}</p>
          <div className="col-span-4 h-[0.5pt] bg-[#D7DAE0]" />
          {doc.items.map((item, index) => (
            <div key={index} className={`${body} col-span-4 grid grid-cols-subgrid pt-[12pt] break-inside-avoid`}>
              <div className="min-w-0 pr-[12pt]">
                <p className="font-semibold">{item.name}</p>
                {item.description && <p className="mt-[2pt] whitespace-pre-line text-[#5E6470]">{item.description}</p>}
              </div>
              <p className="font-medium whitespace-nowrap">{itemQuantity(item)}</p>
              <p className="text-right font-medium whitespace-nowrap">{item.unitPrice}</p>
              <p className="text-right font-medium whitespace-nowrap">{item.amount}</p>
            </div>
          ))}
          <div className="col-span-4 mt-[12pt] h-[0.5pt] bg-[#D7DAE0]" />
        </div>

        <div className={`${body} flex items-start justify-between gap-[16pt] break-inside-avoid`}>
          {/* Not in the design: the payment details take the empty space left of the totals. */}
          <div className="min-w-0 flex-1 pt-[12pt]">
            {doc.paymentAccounts.length > 0 && (
              <>
                <p className={label}>{L.paymentDetails}</p>
                <div className="mt-[4pt] flex flex-col gap-[8pt]">
                  {doc.paymentAccounts.map((account, index) => (
                    <dl key={index} className="flex flex-col gap-[2pt]">
                      {account.title && !account.lines.some((line) => line.value === account.title) && (
                        <p className="font-semibold">{account.title}</p>
                      )}
                      {account.lines.map((line) => (
                        <div key={line.key} className="flex gap-[8pt]">
                          <dt className="w-[80pt] shrink-0 text-[#5E6470]">{line.label}</dt>
                          <dd className="min-w-0 font-semibold break-words whitespace-pre-line">{line.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="w-[240pt] shrink-0 font-medium">
            <div className="flex justify-between pt-[12pt]">
              <span>{L.subtotal}</span>
              <span className="whitespace-nowrap">{doc.subtotal}</span>
            </div>
            {doc.discount && (
              <div className="flex justify-between pt-[12pt]">
                <span>{doc.discountLabel}</span>
                <span className="whitespace-nowrap">−{doc.discount}</span>
              </div>
            )}
            <div className="mt-[12pt] h-[0.5pt] bg-[#D7DAE0]" />
            <div className="flex justify-between pt-[12pt] font-bold">
              <span>{L.total}</span>
              <span className="whitespace-nowrap">{doc.total}</span>
            </div>
          </div>
        </div>

        <p className={`${body} mt-auto pt-[24pt] font-semibold`}>{L.thanksShort}</p>
      </main>

      {doc.notes && (
        <section className={`${body} mt-[24pt] flex flex-col gap-[4pt] px-[16pt] break-inside-avoid`}>
          <p className="font-medium text-[#5E6470]">{L.terms}</p>
          <p className="whitespace-pre-line">{doc.notes}</p>
        </section>
      )}
    </div>
  );
}
