"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { NewWorkspaceForm } from "./new-workspace-form";

/** Check again (after being added to a team), start an own business, or sign out. */
export function WaitingActions() {
  const t = useTranslations();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (creating) {
    return (
      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <p className="text-sm text-fg">{t("waiting.createTitle")}</p>
        <NewWorkspaceForm onCancel={() => setCreating(false)} submitLabel={t("workspaces.create")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Re-renders the page, which moves on to the app once the account is on a team. */}
      <Button onClick={() => router.refresh()}>{t("waiting.checkAgain")}</Button>
      <Button variant="secondary" onClick={() => setCreating(true)}>
        {t("waiting.createOwn")}
      </Button>
      <Button variant="ghost" onClick={signOut}>
        {t("nav.signOut")}
      </Button>
    </div>
  );
}
