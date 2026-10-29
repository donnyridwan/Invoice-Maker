"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import type { SessionUser } from "@/lib/session";
import { LocaleSwitcher } from "./locale-switcher";
import { LogoMark, Sidebar } from "./sidebar";
import { UserMenu } from "./user-menu";

/** The top bar's search: looks through the invoices by number or client, on the invoice list. */
function GlobalSearch() {
  const t = useTranslations("nav");
  return (
    <form action="/invoices" method="get" role="search" className="relative flex min-w-0 flex-1 items-center">
      <Search aria-hidden className="pointer-events-none absolute left-0 size-4 text-muted" />
      <input
        name="q"
        type="search"
        aria-label={t("globalSearch")}
        placeholder={t("globalSearchPlaceholder")}
        className="h-9 w-full max-w-md bg-transparent pl-7 text-sm text-fg placeholder:text-muted focus:outline-none"
      />
    </form>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The invoice editor and detail pages are full-height workspaces with their own top bar (back,
  // number and actions), so the shell's top bar and page padding step aside for them.
  const wide = /^\/invoices\/(?!recurring(\/|$))[^/]+(\/edit)?\/?$/.test(pathname);

  // Onboarding is a focused step: no navigation until the user has moved past it.
  if (pathname.startsWith("/onboarding")) {
    return (
      <main className="min-h-screen bg-white px-4 py-12">
        <p className="mb-8 flex items-center justify-center gap-2.5">
          <LogoMark />
          <span data-slot="wordmark" className="text-xl">
            {t("common.appName")}
          </span>
        </p>
        {children}
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Desktop: a narrow icon rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[70px] flex-col border-r border-border bg-white md:flex">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Sidebar rail />
        </div>
        <div className="flex justify-center py-4">
          <UserMenu user={user} compact />
        </div>
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-white px-3 md:hidden">
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("nav.openMenu")}
          onClick={() => setDrawerOpen(true)}
          className="px-2"
        >
          <Menu className="size-5" />
        </Button>
        <LogoMark className="size-7 text-xs" />
        <span data-slot="wordmark" className="text-base">
          {t("common.appName")}
        </span>
      </header>
      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-white focus:outline-none"
          >
            <DialogTitle className="sr-only">{t("nav.mainMenu")}</DialogTitle>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Sidebar onNavigate={() => setDrawerOpen(false)} />
            </div>
            <div className="p-3">
              <UserMenu user={user} />
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>

      <main className="md:pl-[70px]">
        {wide ? (
          children
        ) : (
          <>
            <div className="sticky top-0 z-20 hidden h-16 items-center justify-between gap-4 border-b border-border bg-white px-8 md:flex">
              <GlobalSearch />
              <LocaleSwitcher />
            </div>
            <div className="w-full px-4 py-6 md:px-8 md:py-8">{children}</div>
          </>
        )}
      </main>
    </div>
  );
}
