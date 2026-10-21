import type { ReactNode } from "react";
import type { BusinessSnapshot, ClientSnapshot } from "@/features/invoices/snapshots";
import type { InvoiceDocument } from "../types";

/** Props every template receives. */
export type TemplateProps = { doc: InvoiceDocument };

/** Text with line breaks preserved (addresses, notes, bank instructions). */
export function Multiline({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={`whitespace-pre-line ${className ?? ""}`}>{children}</span>;
}

/** White or near-black, whichever reads better on the accent color. */
export function readableOn(hex: string): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return "#FFFFFF";
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => parseInt(part, 16));
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.65 ? "#1A1F36" : "#FFFFFF";
}

/** Contact lines of the business, skipping empty fields. */
export function businessLines(business: BusinessSnapshot): string[] {
  return [business.address, business.email, business.phone, business.taxId].filter((v): v is string => Boolean(v));
}

/** Contact lines of the client, skipping empty fields. */
export function clientLines(client: ClientSnapshot): string[] {
  return [client.company, client.address, client.email, client.phone].filter((v): v is string => Boolean(v));
}

/** Logo image when the business has one (plain <img>: the document is also printed to PDF). */
export function Logo({ business, className }: { business: BusinessSnapshot; className?: string }) {
  if (!business.logoUrl) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={business.logoUrl} alt={business.businessName} className={className ?? "max-h-[14mm] max-w-[50mm] object-contain"} />;
}

/** "Label  value" rows of one payment account. */
export function AccountLines({ lines }: { lines: { label: string; value: string }[] }) {
  return (
    <dl className="space-y-[0.8mm]">
      {lines.map((line) => (
        <div key={line.label} className="flex gap-[3mm]">
          <dt className="w-[27mm] shrink-0 text-muted">{line.label}</dt>
          <dd className="min-w-0 font-medium tabular-nums break-words whitespace-pre-line">{line.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function itemQuantity(item: InvoiceDocument["items"][number]): string {
  return item.unit ? `${item.quantity} ${item.unit}` : item.quantity;
}
