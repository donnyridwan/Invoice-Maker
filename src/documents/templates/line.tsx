import { businessLines, clientLines, itemQuantity, Logo, Multiline, type TemplateProps } from "./shared";

/**
 * A plain "Invoice" title over three columns (dates, client, sender); the items hang off an
 * accent-coloured line on the left, and the payment details off a dark one at the foot.
 */
export function LineTemplate({ doc }: TemplateProps) {
  const L = doc.labels;
  // The content column of the items and the footer, right of the dates column.
  const offset = "ml-[37mm]";

  return (
    <div className="flex min-h-[297mm] flex-col px-[16mm] pt-[16mm] pb-[16mm]">
      <header className="flex items-start justify-between gap-[8mm]">
        <p className="text-[27pt] leading-none font-bold tracking-tight">{L.invoice}</p>
        <Logo business={doc.business} className="max-h-[13mm] max-w-[45mm] object-contain" />
      </header>

      <section className="mt-[11mm] grid grid-cols-[37mm_1fr_1fr] gap-x-[6mm]">
        <div className="text-muted tabular-nums">
          <p className="font-semibold text-fg">{L.dueDate}</p>
          <p className="font-semibold text-fg">{doc.dueDate}</p>
          <p className="mt-[2mm]">
            {L.issued} {doc.issueDate}
          </p>
          <p className="mt-[0.8mm]">{doc.number}</p>
        </div>
        <div>
          <p className="font-semibold">{L.billTo}</p>
          {doc.client ? (
            <>
              <p className="mt-[2mm] font-medium text-muted">{doc.client.name}</p>
              {clientLines(doc.client).map((line) => (
                <Multiline key={line} className="mt-[0.4mm] block text-muted">
                  {line}
                </Multiline>
              ))}
            </>
          ) : (
            <p className="mt-[2mm] text-muted">—</p>
          )}
        </div>
        <div>
          <p className="font-semibold">{L.from}</p>
          <p className="mt-[2mm] font-medium text-muted">{doc.business.businessName}</p>
          {businessLines(doc.business).map((line) => (
            <Multiline key={line} className="mt-[0.4mm] block text-muted">
              {line}
            </Multiline>
          ))}
        </div>
      </section>

      <section className={`${offset} mt-[22mm] border-l-[0.6mm] pl-[6mm]`} style={{ borderColor: doc.accentColor }}>
        <table className="w-full border-collapse">
          <colgroup>
            <col />
            <col className="w-[16mm]" />
            <col className="w-[30mm]" />
            <col className="w-[30mm]" />
          </colgroup>
          <thead>
            <tr className="text-[7pt] tracking-[0.06em] text-muted uppercase">
              <th className="pt-[1mm] pb-[3mm] text-left font-medium">{L.description}</th>
              <th className="pt-[1mm] pb-[3mm] text-center font-medium">{L.quantity}</th>
              <th className="pt-[1mm] pb-[3mm] text-right font-medium">{L.unitPrice}</th>
              <th className="pt-[1mm] pb-[3mm] text-right font-medium">{L.amount}</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item, index) => (
              <tr key={index} className="break-inside-avoid">
                <td className="py-[2.5mm] pr-[4mm] align-top">
                  <p className="font-medium">{item.name}</p>
                  {item.description && <Multiline className="mt-[0.6mm] block text-[8.5pt] text-muted">{item.description}</Multiline>}
                </td>
                <td className="py-[2.5mm] text-center align-top tabular-nums whitespace-nowrap">{itemQuantity(item)}</td>
                <td className="py-[2.5mm] text-right align-top tabular-nums whitespace-nowrap">{item.unitPrice}</td>
                <td className="py-[2.5mm] text-right align-top tabular-nums whitespace-nowrap">{item.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-[3mm] break-inside-avoid">
          <div className="flex justify-between border-t border-border py-[3.5mm]">
            <span className="text-muted">{L.subtotal}</span>
            <span className="tabular-nums">{doc.subtotal}</span>
          </div>
          {doc.discount && (
            <div className="flex justify-between border-t border-border py-[3.5mm]">
              <span className="text-muted">{doc.discountLabel}</span>
              <span className="tabular-nums">−{doc.discount}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-border pt-[4mm] pb-[1mm]">
            <span className="text-[11pt] font-semibold">
              {L.total} <span className="text-muted">({doc.currency})</span>
            </span>
            <span className="text-[12pt] font-bold tabular-nums" style={{ color: doc.accentColor }}>
              {doc.total}
            </span>
          </div>
        </div>
      </section>

      {(doc.paymentAccounts.length > 0 || doc.notes) && (
        <footer className={`${offset} mt-auto grid grid-cols-2 gap-x-[10mm] border-l-[0.6mm] border-[#3F4350] pl-[6mm] break-inside-avoid`}>
          <div>
            {doc.paymentAccounts.length > 0 && <p className="font-semibold">{L.paymentDetails}</p>}
            {doc.notes && <Multiline className="mt-[1mm] block text-muted">{doc.notes}</Multiline>}
          </div>
          <div className="space-y-[3mm]">
            {doc.paymentAccounts.map((account, index) => (
              <dl key={index} className="space-y-[0.8mm]">
                {account.title && !account.lines.some((line) => line.value === account.title) && (
                  <p className="font-semibold">{account.title}</p>
                )}
                {account.lines.map((line) => (
                  <div key={line.label} className="flex justify-between gap-[4mm]">
                    <dt>{line.label}</dt>
                    <dd className="text-right text-muted tabular-nums whitespace-pre-line">{line.value}</dd>
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
