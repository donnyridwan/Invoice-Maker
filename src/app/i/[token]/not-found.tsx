import { getTranslations } from "next-intl/server";

export default async function PublicInvoiceNotFound() {
  const t = await getTranslations("public.notFound");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-subtle px-6 text-center">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{t("title")}</h1>
      <p className="max-w-sm text-sm text-muted">{t("description")}</p>
    </main>
  );
}
