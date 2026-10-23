"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Landmark, LayoutDashboard, Package, Settings, Users, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type NavItem = { href: string; labelKey: string; icon: LucideIcon };

/** The sidebar menu: the daily work first, then a group for the business set-up. */
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

/** The logo mark: a black square with the initials. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("flex size-8 items-center justify-center bg-fg font-serif text-sm text-white", className)}>
      IM
    </span>
  );
}

/**
 * The navigation. `rail` is the desktop form, a narrow column of icons (the label is in a tooltip
 * and for assistive technology); otherwise, as in the mobile drawer, icons come with their labels.
 */
export function Sidebar({ rail = false, onNavigate }: { rail?: boolean; onNavigate?: () => void }) {
  const t = useTranslations();
  const pathname = usePathname();
  const active = activeHref(pathname);

  return (
    <div className={cn("flex h-full flex-col", rail && "items-center")}>
      <div className={cn("flex h-16 shrink-0 items-center", rail ? "justify-center" : "gap-2.5 px-4")}>
        <Link
          href="/dashboard"
          onClick={onNavigate}
          aria-label={rail ? t("common.appName") : undefined}
          className="flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <LogoMark />
          {rail ? null : (
            <span data-slot="wordmark" className="text-lg">
              {t("common.appName")}
            </span>
          )}
        </Link>
      </div>
      <nav aria-label={t("nav.mainMenu")} className={cn("flex flex-col gap-1 py-2", rail ? "items-center" : "px-3")}>
        {NAV_GROUPS.map((group, index) => (
          <Fragment key={group.labelKey ?? index}>
            {index > 0 ? <span aria-hidden className={cn("my-2 h-px bg-border", rail ? "w-6" : "mx-1")} /> : null}
            {group.items.map(({ href, labelKey, icon: Icon }) => {
              const current = href === active;
              const label = t(labelKey);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  title={rail ? label : undefined}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex items-center border text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-accent",
                    rail ? "size-10 justify-center" : "h-9 gap-3 px-3",
                    current ? "border-border bg-subtle text-fg" : "border-transparent text-muted hover:bg-subtle hover:text-fg",
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={1.75} />
                  <span className={rail ? "sr-only" : undefined}>{label}</span>
                </Link>
              );
            })}
          </Fragment>
        ))}
      </nav>
    </div>
  );
}
