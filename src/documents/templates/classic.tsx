import { AccountLines, businessLines, clientLines, itemQuantity, Logo, Multiline, type TemplateProps } from "./shared";

export function ClassicTemplate({ doc }: TemplateProps) {
  const L = doc.labels;
  const label = "font-doc-serif text-[8.5pt] tracking-[0.12em] text-muted uppercase";
  const cell = "border border-fg/70 px-[2.5mm] py-[2.2mm]";

  return (
    <div className="px-[20mm] pt-[18mm] pb-[16mm]">
      <header className="text-center">
        <Logo business={doc.business} className="mx-auto mb-[3mm] max-h-[16mm] max-w-[50mm] object-contain" />
        <p className="font-doc-serif text-[20pt] leading-tight tracking-wide">{doc.business.businessName}</p>
        <div className="mt-[2mm] text-[8.5pt] text-muted">
          {businessLines(doc.business).map((line) => (
            <Multiline key={line} className="block">
              {line}
            </Multiline>
          ))}
        </div>
      </header>

      <div className="mt-[8mm] border-y-[0.3mm] border-fg py-[2.5mm] text-center">
        <p className="font-doc-serif text-[13pt] tracking-[0.4em] uppercase">{L.invoice}</p>
      </div>

      <section className="mt-[9mm] grid grid-cols-2 gap-[10mm]">
        <div>
          <p className={label}>{L.billTo}</p>
          {doc.client ? (
            <>
              <p className="mt-[1.5mm] text-[10.5pt] font-semibold">{doc.client.name}</p>
              {clientLines(doc.client).map((line) => (
                <Multiline key={line} className="block text-muted">
                  {line}
                </Multiline>
              ))}
            </>
          ) : (
            <p className="mt-[1.5mm] text-muted">—</p>
          )}
        </div>
        <table className="self-start border-collapse text-[9pt]">
          <tbody>
            {[
              [L.invoiceNumber, doc.number],
              [L.issueDate, doc.issueDate],
              [L.dueDate, doc.dueDate],
            ].map(([key, value]) => (
              <tr key={key}>
                <th className={`${cell} bg-subtle text-left font-medium`}>{key}</th>
                <td className={`${cell} text-right tabular-nums`}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <table className="mt-[10mm] w-full border-collapse">
        <colgroup>
          <col />
          <col className="w-[22mm]" />
          <col className="w-[32mm]" />
          <col className="w-[32mm]" />
        </colgroup>
        <thead>
          <tr className="bg-subtle font-doc-serif text-[8.5pt] tracking-[0.1em] uppercase">
            <th className={`${cell} text-left font-medium`}>{L.description}</th>
            <th className={`${cell} text-right font-medium`}>{L.quantity}</th>
            <th className={`${cell} text-right font-medium`}>{L.unitPrice}</th>
            <th className={`${cell} text-right font-medium`}>{L.amount}</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((item, index) => (
            <tr key={index} className="break-inside-avoid">
              <td className={`${cell} align-top`}>
                <p className="font-medium">{item.name}</p>
                {item.description && <Multiline className="mt-[0.8mm] block text-[8.5pt] text-muted">{item.description}</Multiline>}
              </td>
              <td className={`${cell} text-right align-top tabular-nums whitespace-nowrap`}>{itemQuantity(item)}</td>
              <td className={`${cell} text-right align-top tabular-nums whitespace-nowrap`}>{item.unitPrice}</td>
              <td className={`${cell} text-right align-top tabular-nums whitespace-nowrap`}>{item.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-[5mm] ml-auto w-[84mm] break-inside-avoid">
        <div className="flex justify-between py-[1.2mm]">
          <span>{L.subtotal}</span>
          <span className="tabular-nums">{doc.subtotal}</span>
        </div>
        {doc.discount && (
          <div className="flex justify-between py-[1.2mm]">
            <span>{doc.discountLabel}</span>
            <span className="tabular-nums">−{doc.discount}</span>
          </div>
        )}
        <div className="mt-[2mm] flex items-baseline justify-between border-t-[1.2mm] border-double border-fg pt-[2.5mm]">
          <span className="font-doc-serif text-[11pt] font-bold">{L.total}</span>
          <span className="font-doc-serif text-[13pt] font-bold tabular-nums">{doc.total}</span>
        </div>
      </div>

      {doc.paymentAccounts.length > 0 && (
        <section className="mt-[12mm] break-inside-avoid border border-fg/70 p-[5mm]">
          <p className={label}>{L.paymentDetails}</p>
          <div className="mt-[3mm] grid grid-cols-2 gap-x-[8mm] gap-y-[4mm]">
            {doc.paymentAccounts.map((account, index) => (
              <div key={index}>
                {account.title && <p className="mb-[1mm] font-semibold">{account.title}</p>}
                <AccountLines lines={account.lines} />
              </div>
            ))}
          </div>
        </section>
      )}

      {doc.notes && (
        <section className="mt-[9mm] break-inside-avoid">
          <p className={label}>{L.notes}</p>
          <Multiline className="mt-[1.5mm] block font-doc-serif text-[9.5pt] text-muted italic">{doc.notes}</Multiline>
        </section>
      )}
    </div>
  );
}
