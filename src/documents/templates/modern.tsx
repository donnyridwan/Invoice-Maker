import {
  AccountLines,
  businessLines,
  clientLines,
  itemQuantity,
  Logo,
  Multiline,
  readableOn,
  type TemplateProps,
} from "./shared";

export function ModernTemplate({ doc }: TemplateProps) {
  const L = doc.labels;
  const label = "text-[7pt] font-semibold tracking-[0.14em] text-muted uppercase";

  return (
    <div>
      <header
        className="flex items-end justify-between gap-[8mm] px-[18mm] pt-[16mm] pb-[12mm]"
        style={{ backgroundColor: doc.accentColor, color: readableOn(doc.accentColor) }}
      >
        <div>
          {doc.business.logoUrl ? (
            <Logo business={doc.business} />
          ) : (
            <p className="text-[16pt] leading-tight font-semibold tracking-tight">{doc.business.businessName}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[7.5pt] font-semibold tracking-[0.2em] uppercase opacity-80">{L.invoice}</p>
          <p className="mt-[1mm] text-[20pt] leading-none font-semibold tabular-nums">{doc.number}</p>
        </div>
      </header>

      <div className="px-[18mm] pt-[11mm] pb-[16mm]">
        <section className="grid grid-cols-[1fr_1fr_64mm] gap-[8mm]">
          <div>
            <p className={label}>{L.from}</p>
            <p className="mt-[1.8mm] font-semibold">{doc.business.businessName}</p>
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
                <p className="mt-[1.8mm] font-semibold">{doc.client.name}</p>
                {clientLines(doc.client).map((line) => (
                  <Multiline key={line} className="block text-muted">
                    {line}
                  </Multiline>
                ))}
              </>
            ) : (
              <p className="mt-[1.8mm] text-muted">—</p>
            )}
          </div>
          <div className="self-start rounded-[3mm] border border-border bg-subtle p-[4.5mm]">
            <p className={label}>{L.total}</p>
            <p className="mt-[1.5mm] text-[15pt] leading-tight font-semibold tabular-nums whitespace-nowrap" style={{ color: doc.accentColor }}>
              {doc.total}
            </p>
            <dl className="mt-[3.5mm] space-y-[1.2mm] border-t border-border pt-[3mm] text-[8.5pt]">
              <div className="flex justify-between gap-[2mm]">
                <dt className="text-muted">{L.issueDate}</dt>
                <dd className="text-right font-medium">{doc.issueDate}</dd>
              </div>
              <div className="flex justify-between gap-[2mm]">
                <dt className="text-muted">{L.dueDate}</dt>
                <dd className="text-right font-medium">{doc.dueDate}</dd>
              </div>
            </dl>
          </div>
        </section>

        <table className="mt-[12mm] w-full border-collapse">
          <colgroup>
            <col />
            <col className="w-[22mm]" />
            <col className="w-[32mm]" />
            <col className="w-[32mm]" />
          </colgroup>
          <thead>
            <tr className={`border-b border-fg/15 ${label}`}>
              <th className="py-[2.5mm] text-left font-semibold">{L.description}</th>
              <th className="py-[2.5mm] text-right font-semibold">{L.quantity}</th>
              <th className="py-[2.5mm] text-right font-semibold">{L.unitPrice}</th>
              <th className="py-[2.5mm] text-right font-semibold">{L.amount}</th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item, index) => (
              <tr key={index} className="border-b border-border break-inside-avoid">
                <td className="py-[3.4mm] pr-[4mm] align-top">
                  <p className="font-semibold">{item.name}</p>
                  {item.description && <Multiline className="mt-[0.8mm] block text-[8.5pt] text-muted">{item.description}</Multiline>}
                </td>
                <td className="py-[3.4mm] text-right align-top tabular-nums whitespace-nowrap">{itemQuantity(item)}</td>
                <td className="py-[3.4mm] text-right align-top tabular-nums whitespace-nowrap">{item.unitPrice}</td>
                <td className="py-[3.4mm] text-right align-top font-semibold tabular-nums whitespace-nowrap">{item.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-[6mm] ml-auto w-[84mm] break-inside-avoid">
          <div className="flex justify-between px-[4mm] py-[1.2mm]">
            <span className="text-muted">{L.subtotal}</span>
            <span className="tabular-nums">{doc.subtotal}</span>
          </div>
          {doc.discount && (
            <div className="flex justify-between px-[4mm] py-[1.2mm]">
              <span className="text-muted">{doc.discountLabel}</span>
              <span className="tabular-nums">−{doc.discount}</span>
            </div>
          )}
          <div className="mt-[2mm] flex items-baseline justify-between rounded-[2.5mm] bg-subtle px-[4mm] py-[3mm]">
            <span className="text-[9pt] font-semibold">{L.total}</span>
            <span className="text-[13pt] font-semibold tabular-nums">{doc.total}</span>
          </div>
        </div>

        {doc.paymentAccounts.length > 0 && (
          <section className="mt-[12mm] break-inside-avoid">
            <p className={label}>{L.paymentDetails}</p>
            <div className="mt-[3mm] grid grid-cols-2 gap-[4mm]">
              {doc.paymentAccounts.map((account, index) => (
                <div key={index} className="rounded-[3mm] border border-border p-[4.5mm]">
                  {account.title && <p className="mb-[1.2mm] font-semibold">{account.title}</p>}
                  <AccountLines lines={account.lines} />
                </div>
              ))}
            </div>
          </section>
        )}

        {doc.notes && (
          <section className="mt-[9mm] break-inside-avoid">
            <p className={label}>{L.notes}</p>
            <Multiline className="mt-[1.8mm] block text-muted">{doc.notes}</Multiline>
          </section>
        )}
      </div>
    </div>
  );
}
