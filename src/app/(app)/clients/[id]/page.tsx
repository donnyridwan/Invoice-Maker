import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ClientArchiveButton, ClientForm } from "@/features/clients/client-form";
import { getClient } from "@/features/clients/queries";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/lib/session";

export default async function ClientPage({ params }: PageProps<"/clients/[id]">) {
  const user = await requireUser();
  const t = await getTranslations();
  const { id } = await params;

  const client = await getClient(user.id, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });
  const archived = Boolean(client.archivedAt);

  return (
    <>
      <Link href="/clients" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft className="size-4" />
        {t("nav.clients")}
      </Link>
      <PageHeader
        title={client.name}
        description={archived ? t("clients.archivedNotice") : (client.company ?? undefined)}
        actions={
          <>
            {archived ? <Badge>{t("clients.archived")}</Badge> : null}
            <ClientArchiveButton id={client.id} archived={archived} />
          </>
        }
      />
      <ClientForm client={client} defaults={{ currency: client.defaultCurrency ?? "IDR", language: client.defaultLanguage ?? "id" }} />
    </>
  );
}
