import { clientLines, itemQuantity, Logo, Multiline, readableOn, type TemplateProps } from "./shared";

/**
 * A big grey "Invoice" title, the amount due on an accent-coloured block, a numbered item list
 * and, at the foot of the page, a thank-you line over the payment info.
 */
export function HighlightTemplate({ doc }: TemplateProps) {
  const L = doc.labels;
  const label = "text-[7pt] font-medium tracking-[0.06em] text-muted uppercase";
  const contact = [doc.business.email, doc.business.phone].filter(Boolean);

  return (
    <div className="flex min-h-[297mm] flex-col px-[17mm] pt-[15mm] pb-[14mm]">
      <header className="flex items-start justify-between gap-[8mm]">
        <div className="flex items-center gap-[5mm]">
          <Logo business={doc.business} className="max-h-[17mm] max-w-[30mm] object-contain" />
          <div>
            <p className="text-[15pt] leading-tight font-semibold tracking-tight">{doc.business.businessName}</p>
            {contact.map((line) => (
              <p key={line} className="mt-[0.6mm] text-muted">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="text-right">
          <p className="text-[27pt] leading-none font-semibold tracking-tight text-[#A3A7B0]">{L.invoice}</p>
          <p className="mt-[2mm] font-medium text-muted tabular-nums">{doc.number}</p>
        </div>
      </header>

      <section className="mt-[16mm] grid grid-cols-[1fr_auto_1fr] items-start gap-[8mm]">
        <div>
          <p className={label}>{L.billTo}</p>
          {doc.client ? (
            <>
              <p className="mt-[1.8mm] font-semibold">{doc.client.name}</p>
              {clientLines(doc.client).map((line) => (
                <Multiline key={line} className="mt-[0.4mm] block text-muted">
                  {line}
                </Multiline>
              ))}
            </>
          ) : (
            <p className="mt-[1.8mm] text-muted">—</p>
          )}
        </div>
        <div className="text-center">
          <p className={label}>{L.issueDate}</p>
          <p className="mt-[1.8mm] font-semibold">{doc.issueDate}</p>
          <p className={`${label} mt-[5mm]`}>{L.dueDate}</p>
          <p className="mt-[1.8mm] font-semibold">{doc.dueDate}</p>
        </div>
        <div className="mt-[5mm] flex flex-col items-end">
          <p className={label}>{L.amountDue}</p>
          <p
            className="mt-[1.8mm] px-[3.5mm] py-[2.5mm] text-[13pt] font-bold tabular-nums"
            style={{ backgroundColor: doc.accentColor, color: readableOn(doc.accentColor) }}
          >
            {doc.total}
          </p>
        </div>
      </section>

      <table className="mt-[14mm] w-full border-collapse">
        <colgroup>
          <col className="w-[8mm]" />
          <col />
          <col className="w-[36mm]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border">
            <th className={`${label} py-[2.5mm] text-left`}>#</th>
            <th className={`${label} py-[2.5mm] text-left`}>{L.description}</th>
            <th className={`${label} py-[2.5mm] text-right`}>{L.amount}</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((item, index) => (
            <tr key={index} className="border-b border-border break-inside-avoid">
              <td className="py-[3.2mm] align-top tabular-nums">{index + 1}</td>
              <td className="py-[3.2mm] pr-[4mm] align-top">
                <p className="font-semibold">{item.name}</p>
                <p className="mt-[1mm] text-[8.5pt] text-muted tabular-nums">
                  {itemQuantity(item)} × {item.unitPrice}
                </p>
                {item.description && <Multiline className="mt-[0.6mm] block text-[8.5pt] text-muted">{item.description}</Multiline>}
              </td>
              <td className="py-[3.2mm] text-right align-top tabular-nums whitespace-nowrap">{item.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="break-inside-avoid">
        {doc.discount && (
          <>
            <div className="flex justify-between py-[2mm]">
              <span className="text-muted">{L.subtotal}</span>
              <span className="tabular-nums">{doc.subtotal}</span>
            </div>
            <div className="flex justify-between border-b border-border py-[2mm]">
              <span className="text-muted">{doc.discountLabel}</span>
              <span className="tabular-nums">−{doc.discount}</span>
            </div>
          </>
        )}
        <div className="flex justify-between pt-[3mm]">
          <span className="font-semibold">{L.total}</span>
          <span className="font-bold tabular-nums">{doc.total}</span>
        </div>
      </div>

      {doc.notes && (
        <div className="mt-[4mm] flex items-start gap-[2mm] break-inside-avoid text-muted">
          <span aria-hidden className="mt-[0.3mm] flex size-[3.6mm] shrink-0 items-center justify-center bg-[#A3A7B0] text-[8pt] leading-none font-bold text-white">
            “
          </span>
          <Multiline>{doc.notes}</Multiline>
        </div>
      )}

      <footer className="mt-auto pt-[14mm] break-inside-avoid">
        <p className="font-semibold">{L.thanks}</p>
        {doc.paymentAccounts.length > 0 && (
          <>
            <div className="mt-[6mm] flex items-center gap-[3mm]">
              <p className={label}>{L.paymentDetails}</p>
              <span className="h-px flex-1 bg-border" />
            </div>
            {doc.paymentAccounts.map((account, index) => (
              <div key={index} className="mt-[4mm] flex items-start justify-between gap-[6mm]">
                <p className="pt-[0.2mm] font-semibold">{account.title}</p>
                <dl className="flex divide-x divide-border">
                  {account.lines.map((line) => (
                    <div key={line.label} className="px-[4mm] last:pr-0">
                      <dt className="text-[7.5pt] text-muted">{line.label}</dt>
                      <dd className="mt-[0.8mm] font-medium tabular-nums whitespace-pre-line">{line.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </>
        )}
      </footer>
    </div>
  );
}
