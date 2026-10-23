"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import type { SessionUser } from "@/lib/session";
import { Breadcrumbs } from "./breadcrumbs";
import { LocaleSwitcher } from "./locale-switcher";
import { Sidebar } from "./sidebar";
import { UserMenu } from "./user-menu";

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The invoice editor and detail pages are full-width workspaces with their own top bar (breadcrumb
  // and actions), so the shell's top bar and page padding step aside for them.
  const wide = /^\/invoices\/(?!recurring(\/|$))[^/]+(\/edit)?\/?$/.test(pathname);

  // Onboarding is a focused step: no navigation until the user has moved past it.
  if (pathname.startsWith("/onboarding")) {
    return (
      <main className="min-h-screen bg-sidebar px-4 py-12">
        <p data-slot="wordmark" className="mb-6 text-center text-xl">{t("common.appName")}</p>
        {children}
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-sidebar md:flex">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Sidebar />
        </div>
        <div className="p-2">
          <UserMenu user={user} />
        </div>
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-white px-3 md:hidden">
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("nav.openMenu")}
          onClick={() => setDrawerOpen(true)}
          className="px-2"
        >
          <Menu className="size-5" />
        </Button>
        <span data-slot="wordmark" className="text-[15px]">{t("common.appName")}</span>
      </header>
      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-sidebar shadow-lg focus:outline-none"
          >
            <DialogTitle className="sr-only">{t("nav.mainMenu")}</DialogTitle>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Sidebar onNavigate={() => setDrawerOpen(false)} />
            </div>
            <div className="p-2">
              <UserMenu user={user} />
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>

      <main className="md:pl-60">
        {wide ? (
          children
        ) : (
          <>
            <div className="sticky top-0 z-20 hidden h-12 items-center justify-between gap-4 border-b border-border bg-white px-6 md:flex">
              <Breadcrumbs />
              <LocaleSwitcher />
            </div>
            <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</div>
          </>
        )}
      </main>
    </div>
  );
}
