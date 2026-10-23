import Link from "next/link";
import { FilePlus2, Landmark, Package, UserPlus, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { createInvoiceAction } from "@/features/invoices/actions";
import { cn } from "@/lib/utils";

const TILE_CLASS =
  "group flex w-full flex-col gap-2.5 text-left focus-visible:outline-none [&:focus-visible>span:first-child]:outline-2 [&:focus-visible>span:first-child]:outline-offset-2 [&:focus-visible>span:first-child]:outline-accent";

/** The grey square with a small white card and a coloured dot: a quiet illustration per action. */
function TileArt({ icon: Icon, dot }: { icon: LucideIcon; dot: string }) {
  return (
    <span className="flex h-24 w-full items-center sm:h-32 justify-center rounded-card bg-tile transition-colors group-hover:bg-[#ececec]">
      <span className="relative flex size-14 items-center justify-center rounded-xl bg-white shadow-[0_2px_8px_rgba(10,10,10,0.08)] transition-transform group-hover:-translate-y-0.5">
        <Icon className="size-6 text-fg" strokeWidth={1.75} />
        <span aria-hidden className={cn("absolute -right-1.5 -top-1.5 size-4 rounded-full ring-2 ring-white", dot)} />
      </span>
    </span>
  );
}

/** The row of shortcuts at the top of the dashboard: start an invoice, add a client, a catalog item or an account. */
export async function QuickActions() {
  const t = await getTranslations();
  const links = [
    { href: "/clients/new", label: t("clients.new"), icon: UserPlus, dot: "bg-[#3b82f6]" },
    { href: "/catalog", label: t("nav.catalog"), icon: Package, dot: "bg-[#f59e0b]" },
    { href: "/settings/payment-accounts", label: t("nav.paymentAccounts"), icon: Landmark, dot: "bg-[#a855f7]" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
      <form action={createInvoiceAction}>
        <button type="submit" className={TILE_CLASS}>
          <TileArt icon={FilePlus2} dot="bg-[#10b981]" />
          <span className="text-center text-[13px] font-medium text-fg">{t("invoices.new")}</span>
        </button>
      </form>
      {links.map(({ href, label, icon, dot }) => (
        <Link key={href} href={href} className={TILE_CLASS}>
          <TileArt icon={icon} dot={dot} />
          <span className="text-center text-[13px] font-medium text-fg">{label}</span>
        </Link>
      ))}
    </div>
  );
}
