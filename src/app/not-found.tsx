import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{t("common.notFoundTitle")}</h1>
      <p className="max-w-sm text-sm text-muted">{t("common.notFoundDescription")}</p>
      <Button asChild>
        {/* Full page load: a client navigation into the (app) layout can loop on its redirects. */}
        <a href="/dashboard">{t("nav.dashboard")}</a>
      </Button>
    </main>
  );
}
