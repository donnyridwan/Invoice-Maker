import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LogoMark } from "@/components/app-shell/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WaitingActions } from "@/features/workspaces/waiting-actions";
import { getWorkspaceContext } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Where an account that belongs to no workspace lands: it waits for an owner to add it to their
 * team (by the email shown here), or starts a business of its own.
 */
export default async function WaitingPage() {
  const { user, workspace } = await getWorkspaceContext();
  if (workspace) redirect("/dashboard");
  const t = await getTranslations();

  return (
    <main className="min-h-screen bg-white px-4 py-12">
      <p className="mb-8 flex items-center justify-center gap-2.5">
        <LogoMark />
        <span data-slot="wordmark" className="text-xl">
          {t("common.appName")}
        </span>
      </p>
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("waiting.title")}</CardTitle>
            <CardDescription>{t("waiting.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="border border-border bg-subtle px-3 py-2.5">
              <p className="text-xs text-muted">{t("waiting.yourEmail")}</p>
              <p className="text-sm break-all text-fg">{user.email}</p>
            </div>
            <WaitingActions />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
