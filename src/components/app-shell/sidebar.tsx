"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, LayoutDashboard, Package, Settings, Users, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export const NAV_ITEMS: { href: string; labelKey: string; icon: LucideIcon }[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/invoices", labelKey: "nav.invoices", icon: FileText },
  { href: "/clients", labelKey: "nav.clients", icon: Users },
  { href: "/catalog", labelKey: "nav.catalog", icon: Package },
  { href: "/settings", labelKey: "nav.settings", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-5">
        <Link href="/dashboard" onClick={onNavigate} data-slot="wordmark" className="text-lg font-semibold tracking-tight text-fg">
          {t("common.appName")}
        </Link>
      </div>
      <nav aria-label={t("nav.mainMenu")} className="flex flex-col gap-0.5 px-3 py-2">
        {NAV_ITEMS.map(({ href, labelKey, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-button px-3 text-sm font-medium text-muted transition-colors hover:bg-subtle hover:text-fg",
                active && "bg-subtle font-semibold text-accent hover:text-accent",
              )}
            >
              <Icon className="size-4" />
              {t(labelKey)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
