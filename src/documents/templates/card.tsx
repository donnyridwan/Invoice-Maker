import { clientLines, itemQuantity, Logo, Multiline, type TemplateProps } from "./shared";

/**
 * The sender over a light grey page, the invoice itself on a white rounded card (client, number,
 * dates and the total in the accent colour up top), and the notes under the card.
 */
export function CardTemplate({ doc }: TemplateProps) {
  const L = doc.labels;
  const accent = { color: doc.accentColor };
  const label = "text-muted";
  const contact = [doc.business.email, doc.business.phone].filter(Boolean);
  const address = [doc.business.address, doc.business.taxId].filter(Boolean);

  return (
    <div className="flex min-h-[297mm] flex-col bg-[#F7F8FA] px-[5mm] pt-[11mm] pb-[9mm]">
      <header className="flex items-start justify-between gap-[8mm] px-[6mm]">
        <div className="flex items-start gap-[5mm]">
          {doc.business.logoUrl ? (
            <Logo business={doc.business} className="max-h-[17mm] max-w-[30mm] object-contain" />
          ) : (
            <span aria-hidden className="font-serif text-[40pt] leading-[0.85] font-bold" style={accent}>
              {doc.business.businessName.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <p className="text-[14pt] leading-tight font-semibold" style={accent}>
              {doc.business.businessName}
            </p>
            {contact.map((line) => (
              <p key={line} className="mt-[0.6mm] text-muted">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="pt-[6mm] text-right text-muted">
          {address.map((line) => (
            <Multiline key={line} className="block">
              {line}
            </Multiline>
          ))}
        </div>
      </header>

      <main className="mt-[8mm] flex flex-1 flex-col rounded-[3mm] border border-[#E9EAEE] bg-white px-[6mm] pt-[7mm] pb-[7mm]">
        <section className="grid grid-cols-3 gap-[6mm]">
          <div>
            <p className={label}>{L.billTo}</p>
            {doc.client ? (
              <>
                <p className="mt-[1.5mm] font-semibold">{doc.client.name}</p>
                {clientLines(doc.client).map((line) => (
                  <Multiline key={line} className="mt-[0.4mm] block text-muted">
                    {line}
                  </Multiline>
                ))}
              </>
            ) : (
              <p className="mt-[1.5mm] text-muted">—</p>
            )}
          </div>
          <div>
            <p className={label}>{L.invoiceNumber}</p>
            <p className="mt-[1.5mm] font-semibold tabular-nums">{doc.number}</p>
            <p className={`${label} mt-[5mm]`}>{L.issueDate}</p>
            <p className="mt-[1.5mm] font-semibold">{doc.issueDate}</p>
          </div>
          <div className="text-right">
            <p className={label}>
              {L.invoiceOf} ({doc.currency})
            </p>
            <p className="mt-[1mm] text-[17pt] leading-tight font-bold tabular-nums" style={accent}>
              {doc.total}
            </p>
            <p className={`${label} mt-[4mm]`}>{L.dueDate}</p>
            <p className="mt-[1.5mm] font-semibold">{doc.dueDate}</p>
          </div>
        </section>

        <table className="mt-[8mm] w-full border-collapse">
          <colgroup>
            <col />
            <col className="w-[18mm]" />
            <col className="w-[30mm]" />
            <col className="w-[30mm]" />
          </colgroup>
          <thead>
            <tr className="border-y border-border text-[7pt] tracking-[0.06em] text-muted uppercase">
              <th className="py-[2.5mm] text-left font-medium">{L.description}</th>
              <th className="py-[2.5mm] text-right font-medium">{L.quantity}</th>
              <th className="py-[2.5mm] text-right font-medium">{L.unitPrice}</th>
              <th className="py-[2.5mm] text-right font-medium">{L.amount}</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item, index) => (
              <tr key={index} className="break-inside-avoid">
                <td className="pt-[3.5mm] pr-[4mm] align-top">
                  <p className="font-semibold">{item.name}</p>
                  {item.description && <Multiline className="mt-[0.6mm] block text-muted">{item.description}</Multiline>}
                </td>
                <td className="pt-[3.5mm] text-right align-top tabular-nums whitespace-nowrap">{itemQuantity(item)}</td>
                <td className="pt-[3.5mm] text-right align-top tabular-nums whitespace-nowrap">{item.unitPrice}</td>
                <td className="pt-[3.5mm] text-right align-top tabular-nums whitespace-nowrap">{item.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-[5mm] grid grid-cols-2 border-t border-border break-inside-avoid">
          <div />
          <div>
            <div className="flex justify-between py-[2.5mm]">
              <span>{L.subtotal}</span>
              <span className="tabular-nums">{doc.subtotal}</span>
            </div>
            {doc.discount && (
              <div className="flex justify-between py-[2.5mm]">
                <span>{doc.discountLabel}</span>
                <span className="tabular-nums">−{doc.discount}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border py-[3mm]">
              <span className="font-semibold">{L.total}</span>
              <span className="font-bold tabular-nums">{doc.total}</span>
            </div>
          </div>
        </div>

        {doc.paymentAccounts.length > 0 && (
          <section className="mt-[8mm] break-inside-avoid">
            <p className={label}>{L.paymentDetails}</p>
            <div className="mt-[2.5mm] grid grid-cols-2 gap-x-[8mm] gap-y-[4mm]">
              {doc.paymentAccounts.map((account, index) => (
                <dl key={index} className="space-y-[0.8mm]">
                  {account.title && !account.lines.some((line) => line.value === account.title) && (
                    <p className="font-semibold">{account.title}</p>
                  )}
                  {account.lines.map((line) => (
                    <div key={line.label} className="flex gap-[3mm]">
                      <dt className="w-[27mm] shrink-0 text-muted">{line.label}</dt>
                      <dd className="min-w-0 font-medium tabular-nums break-words whitespace-pre-line">{line.value}</dd>
                    </div>
                  ))}
                </dl>
              ))}
            </div>
          </section>
        )}

        <p className="mt-auto pt-[10mm] font-semibold">{L.thanks}</p>
      </main>

      {doc.notes && (
        <section className="mt-[6mm] px-[6mm] break-inside-avoid">
          <p className="text-muted">{L.notes}</p>
          <Multiline className="mt-[1mm] block">{doc.notes}</Multiline>
        </section>
      )}
    </div>
  );
}
