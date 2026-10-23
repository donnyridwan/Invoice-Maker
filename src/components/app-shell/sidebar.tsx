"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Landmark, LayoutDashboard, Package, Settings, Users, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type NavItem = { href: string; labelKey: string; icon: LucideIcon };

/** The sidebar menu: the daily work first, then a labelled group for the business set-up. */
export const NAV_GROUPS: { labelKey?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { href: "/invoices", labelKey: "nav.invoices", icon: FileText },
      { href: "/clients", labelKey: "nav.clients", icon: Users },
      { href: "/catalog", labelKey: "nav.catalog", icon: Package },
    ],
  },
  {
    labelKey: "nav.business",
    items: [
      { href: "/settings/payment-accounts", labelKey: "nav.paymentAccounts", icon: Landmark },
      { href: "/settings", labelKey: "nav.settings", icon: Settings },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** The menu item the path belongs to: the longest matching href, so /settings/payment-accounts is not also Settings. */
function activeHref(pathname: string): string | undefined {
  return NAV_ITEMS.map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations();
  const pathname = usePathname();
  const active = activeHref(pathname);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center px-4">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span aria-hidden className="flex size-6 items-center justify-center rounded-md bg-fg text-[11px] font-bold text-white">
            IM
          </span>
          <span data-slot="wordmark" className="text-[15px]">
            {t("common.appName")}
          </span>
        </Link>
      </div>
      <nav aria-label={t("nav.mainMenu")} className="flex flex-col gap-4 px-2 py-2">
        {NAV_GROUPS.map((group, index) => (
          <div key={group.labelKey ?? index} className="flex flex-col gap-0.5">
            {group.labelKey ? <p className="px-2.5 pb-1 text-xs font-medium text-muted">{t(group.labelKey)}</p> : null}
            {group.items.map(({ href, labelKey, icon: Icon }) => {
              const current = href === active;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium text-fg/80 transition-colors hover:bg-black/[0.04] hover:text-fg focus-visible:outline-2 focus-visible:outline-accent",
                    current && "bg-black/[0.06] text-fg hover:bg-black/[0.06]",
                  )}
                >
                  <Icon className={cn("size-4", current ? "text-fg" : "text-muted")} />
                  {t(labelKey)}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
