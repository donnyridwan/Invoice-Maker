"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import type { SessionUser } from "@/lib/session";
import { Sidebar } from "./sidebar";
import { UserMenu } from "./user-menu";

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The invoice editor is a two-column workspace, so it gets the full width and no top padding
  // (its own sticky header sits flush under the top bar).
  const wide = /^\/invoices\/[^/]+\/edit(\/|$)/.test(pathname);

  // Onboarding is a focused step: no navigation until the user has moved past it.
  if (pathname.startsWith("/onboarding")) {
    return (
      <main className="min-h-screen bg-subtle px-4 py-12">
        <p className="mb-6 text-center text-xl font-semibold tracking-tight text-fg">{t("common.appName")}</p>
        {children}
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-white md:flex">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Sidebar />
        </div>
        <div className="border-t border-border p-3">
          <UserMenu user={user} />
        </div>
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-white px-4 md:hidden">
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("nav.openMenu")}
          onClick={() => setDrawerOpen(true)}
          className="px-2"
        >
          <Menu className="size-5" />
        </Button>
        <span data-slot="wordmark" className="text-base font-semibold tracking-tight text-fg">{t("common.appName")}</span>
      </header>
      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPortal>
          <DialogOverlay />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-border bg-white shadow-lg focus:outline-none"
          >
            <DialogTitle className="sr-only">{t("nav.mainMenu")}</DialogTitle>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Sidebar onNavigate={() => setDrawerOpen(false)} />
            </div>
            <div className="border-t border-border p-3">
              <UserMenu user={user} />
            </div>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>

      <main className="md:pl-60">
        <div className={wide ? "w-full px-4 pb-8 md:px-6" : "mx-auto w-full max-w-6xl px-4 py-6 md:p-8"}>
          {children}
        </div>
      </main>
    </div>
  );
}
