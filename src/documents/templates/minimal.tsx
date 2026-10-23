import { AccountLines, businessLines, clientLines, itemQuantity, Logo, Multiline, type TemplateProps } from "./shared";

export function MinimalTemplate({ doc }: TemplateProps) {
  const L = doc.labels;
  const accent = { color: doc.accentColor };
  const label = "text-[8pt] font-medium text-muted";

  return (
    <div className="px-[18mm] pt-[18mm] pb-[16mm]">
      <header className="flex items-start justify-between gap-[8mm]">
        <div>
          {doc.business.logoUrl ? (
            <Logo business={doc.business} />
          ) : (
            <p className="text-[13pt] font-semibold tracking-tight">{doc.business.businessName}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[28pt] leading-none font-semibold tracking-tight" style={accent}>
            {L.invoice}
          </p>
          <p className="mt-[2.5mm] text-[9pt] text-muted tabular-nums">{doc.number}</p>
        </div>
      </header>

      <section className="mt-[14mm] grid grid-cols-3 gap-[8mm]">
        <div>
          <p className={label}>{L.from}</p>
          <p className="mt-[1.5mm] font-semibold">{doc.business.businessName}</p>
          {businessLines(doc.business).map((line) => (
            <Multiline key={line} className="block text-muted">
              {line}
            </Multiline>
          ))}
        </div>
        <div>
          <p className={label}>{L.billTo}</p>
          {doc.client ? (
            <>
              <p className="mt-[1.5mm] font-semibold">{doc.client.name}</p>
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
        <div className="text-right">
          <p className={label}>{L.issueDate}</p>
          <p className="mt-[1.5mm] font-medium">{doc.issueDate}</p>
          <p className={`${label} mt-[4mm]`}>{L.dueDate}</p>
          <p className="mt-[1.5mm] font-medium">{doc.dueDate}</p>
        </div>
      </section>

      <table className="mt-[13mm] w-full border-collapse">
        <colgroup>
          <col />
          <col className="w-[22mm]" />
          <col className="w-[32mm]" />
          <col className="w-[32mm]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border text-[8pt] text-muted">
            <th className="py-[2.5mm] text-left font-medium">{L.description}</th>
            <th className="py-[2.5mm] text-right font-medium">{L.quantity}</th>
            <th className="py-[2.5mm] text-right font-medium">{L.unitPrice}</th>
            <th className="py-[2.5mm] text-right font-medium">{L.amount}</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((item, index) => (
            <tr key={index} className="border-b border-border break-inside-avoid">
              <td className="py-[3.2mm] pr-[4mm] align-top">
                <p className="font-medium">{item.name}</p>
                {item.description && <Multiline className="mt-[0.8mm] block text-[8.5pt] text-muted">{item.description}</Multiline>}
              </td>
              <td className="py-[3.2mm] text-right align-top tabular-nums whitespace-nowrap">{itemQuantity(item)}</td>
              <td className="py-[3.2mm] text-right align-top tabular-nums whitespace-nowrap">{item.unitPrice}</td>
              <td className="py-[3.2mm] text-right align-top font-medium tabular-nums whitespace-nowrap">{item.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-[6mm] ml-auto w-[82mm] break-inside-avoid">
        <div className="flex justify-between py-[1.2mm]">
          <span className="text-muted">{L.subtotal}</span>
          <span className="tabular-nums">{doc.subtotal}</span>
        </div>
        {doc.discount && (
          <div className="flex justify-between py-[1.2mm]">
            <span className="text-muted">{doc.discountLabel}</span>
            <span className="tabular-nums">−{doc.discount}</span>
          </div>
        )}
        <div className="mt-[2mm] flex items-baseline justify-between border-t border-border pt-[3mm]">
          <span className="text-[10pt] font-semibold">{L.total}</span>
          <span className="text-[15pt] font-semibold tabular-nums" style={accent}>
            {doc.total}
          </span>
        </div>
      </div>

      {doc.paymentAccounts.length > 0 && (
        <section className="mt-[13mm] break-inside-avoid rounded-[1.5mm] bg-subtle p-[5mm]">
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
          <Multiline className="mt-[1.5mm] block text-muted">{doc.notes}</Multiline>
        </section>
      )}
    </div>
  );
}
