import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { ClientForm } from "@/features/clients/client-form";
import { getProfile } from "@/features/profile/queries";
import { requireUser } from "@/lib/session";

export default async function NewClientPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const profile = await getProfile(user.id);

  return (
    <>
      <Link href="/clients" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" />
        {t("nav.clients")}
      </Link>
      <PageHeader title={t("clients.new")} description={t("clients.newDescription")} />
      <ClientForm client={null} defaults={{ currency: profile.defaultCurrency, language: profile.defaultLanguage }} />
    </>
  );
}
