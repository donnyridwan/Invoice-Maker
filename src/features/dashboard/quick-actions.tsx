import Link from "next/link";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createInvoiceAction } from "@/features/invoices/actions";

const TILE_CLASS =
  "group flex w-full flex-col gap-2.5 text-left focus-visible:outline-none [&:focus-visible>span:first-child]:outline-2 [&:focus-visible>span:first-child]:outline-offset-2 [&:focus-visible>span:first-child]:outline-accent";

/** The grey square a shortcut's little illustration sits on. */
function TileFrame({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="relative flex h-24 w-full items-center justify-center overflow-hidden rounded-card bg-tile transition-colors group-hover:bg-[#ececec] sm:h-32">
      <span className="flex items-center justify-center transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-[1.03]">
        {children}
      </span>
    </span>
  );
}

function PlusBadge() {
  return (
    <span className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-fg text-white ring-2 ring-tile">
      <Plus className="size-3" strokeWidth={3} />
    </span>
  );
}

/** A sheet of paper with a few lines and a green amount chip. */
function InvoiceArt() {
  return (
    <span className="relative flex h-[68px] w-14 flex-col gap-1.5 rounded-md bg-white p-2 shadow-[0_2px_8px_rgba(10,10,10,0.1)]">
      <span className="h-1 w-6 rounded-full bg-[#d4d4d4]" />
      <span className="h-1 w-9 rounded-full bg-[#e5e5e5]" />
      <span className="h-1 w-7 rounded-full bg-[#e5e5e5]" />
      <span className="mt-auto self-end rounded bg-[#10b981] px-1 text-[8px] font-bold leading-3 text-white">Rp</span>
      <PlusBadge />
    </span>
  );
}

/** Three overlapping people. */
function ClientArt() {
  return (
    <span className="relative flex items-center">
      <span className="size-9 rounded-full bg-gradient-to-br from-[#7dd3fc] to-[#3b82f6] ring-2 ring-tile" />
      <span className="-ml-3 size-10 rounded-full bg-gradient-to-br from-[#ff9a62] to-[#f5576c] ring-2 ring-tile" />
      <span className="-ml-3 size-9 rounded-full bg-gradient-to-br from-[#86efac] to-[#10b981] ring-2 ring-tile" />
      <PlusBadge />
    </span>
  );
}

/** Two stacked item cards with a price tag. */
function CatalogArt() {
  return (
    <span className="relative h-14 w-16">
      <span className="absolute left-2 top-0 h-10 w-14 -rotate-6 rounded-md bg-white/70 shadow-[0_1px_4px_rgba(10,10,10,0.08)]" />
      <span className="absolute bottom-0 left-0 flex h-10 w-14 flex-col justify-center gap-1 rounded-md bg-white px-2 shadow-[0_2px_8px_rgba(10,10,10,0.1)]">
        <span className="h-1 w-7 rounded-full bg-[#d4d4d4]" />
        <span className="h-1 w-5 rounded-full bg-[#e5e5e5]" />
      </span>
      <span className="absolute -right-1 bottom-6 rounded-full bg-[#f59e0b] px-1.5 text-[8px] font-bold leading-4 text-white shadow-sm">
        Rp
      </span>
    </span>
  );
}

/** A bank card. */
function AccountArt() {
  return (
    <span className="relative flex h-12 w-[76px] flex-col justify-between rounded-lg bg-gradient-to-br from-[#a78bfa] to-[#6366f1] p-2 shadow-[0_2px_8px_rgba(99,102,241,0.35)]">
      <span className="h-2.5 w-3.5 rounded-sm bg-[#fde68a]" />
      <span className="flex gap-1">
        <span className="h-1 w-3 rounded-full bg-white/70" />
        <span className="h-1 w-3 rounded-full bg-white/70" />
        <span className="h-1 w-3 rounded-full bg-white/70" />
      </span>
    </span>
  );
}

/** The row of shortcuts at the top of the dashboard: start an invoice, add a client, a catalog item or an account. */
export async function QuickActions() {
  const t = await getTranslations();
  const links = [
    { href: "/clients/new", label: t("clients.new"), art: <ClientArt /> },
    { href: "/catalog", label: t("nav.catalog"), art: <CatalogArt /> },
    { href: "/settings/payment-accounts", label: t("nav.paymentAccounts"), art: <AccountArt /> },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      <form action={createInvoiceAction}>
        <button type="submit" className={TILE_CLASS}>
          <TileFrame>
            <InvoiceArt />
          </TileFrame>
          <span className="text-center text-[13px] font-medium text-fg">{t("invoices.new")}</span>
        </button>
      </form>
      {links.map(({ href, label, art }) => (
        <Link key={href} href={href} className={TILE_CLASS}>
          <TileFrame>{art}</TileFrame>
          <span className="text-center text-[13px] font-medium text-fg">{label}</span>
        </Link>
      ))}
    </div>
  );
}
