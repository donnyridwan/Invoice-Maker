"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

type Crumb = { label: string; href?: string };

const SECTIONS: Record<string, string> = {
  dashboard: "nav.dashboard",
  invoices: "nav.invoices",
  clients: "nav.clients",
  catalog: "nav.catalog",
  settings: "nav.settings",
};

/** The trail for the top bar, from the URL: the section, then the page inside it when there is one. */
function useCrumbs(): Crumb[] {
  const t = useTranslations();
  const [section, sub] = usePathname().split("/").filter(Boolean);
  if (!section || !SECTIONS[section]) return [];
  const root: Crumb = { label: t(SECTIONS[section]), href: `/${section}` };
  if (!sub) return [{ label: root.label }];

  const subLabel =
    section === "settings" && sub === "payment-accounts"
      ? t("nav.paymentAccounts")
      : section === "invoices" && sub === "recurring"
        ? t("invoices.tabs.recurring")
        : section === "clients" && sub === "new"
          ? t("clients.new")
          : section === "clients"
            ? t("clients.editTitle")
            : t("nav.detail");
  return [root, { label: subLabel }];
}

export function Breadcrumbs() {
  const t = useTranslations("nav");
  const crumbs = useCrumbs();
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label={t("breadcrumb")} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.label}>
            {index > 0 ? <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted" /> : null}
            <li className="min-w-0 truncate">
              {crumb.href ? (
                <Link href={crumb.href} className="text-muted hover:text-fg">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page" className="font-medium text-fg">
                  {crumb.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
