"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setLocale } from "@/i18n/actions";
import type { Locale } from "@/i18n/config";
import { authClient } from "@/lib/auth-client";
import type { SessionUser } from "@/lib/session";

const LANGUAGES: { value: Locale; label: string }[] = [
  { value: "id", label: "Bahasa Indonesia" },
  { value: "en", label: "English" },
];

export function UserMenu({ user }: { user: Pick<SessionUser, "name" | "email"> }) {
  const t = useTranslations();
  const router = useRouter();
  const current = useLocale();
  const [pending, startTransition] = useTransition();

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("nav.userMenu")}
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
          {(user.name.trim()[0] ?? user.email[0] ?? "?").toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{user.name}</span>
          <span className="block truncate text-xs text-muted">{user.email}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-medium text-fg">{user.name}</span>
          <span className="block truncate font-normal">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("common.language")}</DropdownMenuLabel>
        {LANGUAGES.map((language) => (
          <DropdownMenuItem
            key={language.value}
            disabled={pending}
            onSelect={() => startTransition(() => setLocale(language.value))}
          >
            <span className="flex size-4 items-center justify-center">
              {language.value === current ? <Check className="size-4 text-accent" /> : null}
            </span>
            {language.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut className="size-4 text-muted" />
          {t("nav.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
