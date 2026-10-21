import Link from "next/link";
import { Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ListToolbar } from "@/components/list-toolbar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ClientTable } from "@/features/clients/client-table";
import { listClients } from "@/features/clients/queries";
import { firstParam } from "@/lib/search-params";
import { requireUser } from "@/lib/session";

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const user = await requireUser();
  const t = await getTranslations();
  const params = await searchParams;
  const q = firstParam(params.q)?.trim() ?? "";
  const archived = firstParam(params.tab) === "archived";

  const found = await listClients(user.id, { search: q, includeArchived: archived });
  const clients = archived ? found.filter((c) => c.archivedAt) : found;

  return (
    <>
      <PageHeader
        title={t("clients.title")}
        description={t("clients.description")}
        actions={
          <Button asChild>
            <Link href="/clients/new">
              <Plus className="size-4" />
              {t("clients.new")}
            </Link>
          </Button>
        }
      />

      <ListToolbar
        basePath="/clients"
        q={q}
        archived={archived}
        tabsLabel={t("clients.title")}
        searchLabel={t("clients.searchLabel")}
        searchPlaceholder={t("clients.searchPlaceholder")}
        activeLabel={t("clients.tabActive")}
        archivedLabel={t("clients.tabArchived")}
      />

      {clients.length > 0 ? (
        <ClientTable clients={clients} />
      ) : q ? (
        <EmptyState title={t("clients.noResultsTitle")} description={t("clients.noResultsDescription")} />
      ) : archived ? (
        <EmptyState title={t("clients.archivedEmptyTitle")} />
      ) : (
        <EmptyState
          title={t("clients.emptyTitle")}
          description={t("clients.emptyDescription")}
          action={
            <Button asChild variant="secondary">
              <Link href="/clients/new">
                <Plus className="size-4" />
                {t("clients.new")}
              </Link>
            </Button>
          }
        />
      )}
    </>
  );
}
