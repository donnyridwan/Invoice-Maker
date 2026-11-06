import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { ClientForm } from "@/features/clients/client-form";
import { getProfile } from "@/features/profile/queries";
import { requireWorkspace } from "@/lib/workspace";

export default async function NewClientPage() {
  const { workspaceId } = await requireWorkspace();
  const t = await getTranslations();
  const profile = await getProfile(workspaceId);

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
