import { getTranslations } from "next-intl/server";
import { ListToolbar } from "@/components/list-toolbar";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { CatalogTable, NewCatalogItemButton } from "@/features/catalog/catalog-table";
import { listCatalogItems } from "@/features/catalog/queries";
import { getProfile } from "@/features/profile/queries";
import { firstParam } from "@/lib/search-params";
import { requireUser } from "@/lib/session";

export default async function CatalogPage({ searchParams }: PageProps<"/catalog">) {
  const user = await requireUser();
  const t = await getTranslations();
  const params = await searchParams;
  const q = firstParam(params.q)?.trim() ?? "";
  const archived = firstParam(params.tab) === "archived";

  const [profile, found] = await Promise.all([
    getProfile(user.id),
    listCatalogItems(user.id, { search: q, includeArchived: archived }),
  ]);
  const items = archived ? found.filter((i) => i.archivedAt) : found;
  const defaultCurrency = profile.defaultCurrency;

  return (
    <>
      <PageHeader
        title={t("catalog.title")}
        description={t("catalog.description")}
        actions={<NewCatalogItemButton defaultCurrency={defaultCurrency} />}
      />

      <ListToolbar
        basePath="/catalog"
        q={q}
        archived={archived}
        tabsLabel={t("catalog.title")}
        searchLabel={t("catalog.searchLabel")}
        searchPlaceholder={t("catalog.searchPlaceholder")}
        activeLabel={t("catalog.tabActive")}
        archivedLabel={t("catalog.tabArchived")}
      />

      {items.length > 0 ? (
        <CatalogTable items={items} defaultCurrency={defaultCurrency} />
      ) : q ? (
        <EmptyState title={t("catalog.noResultsTitle")} description={t("catalog.noResultsDescription")} />
      ) : archived ? (
        <EmptyState title={t("catalog.archivedEmptyTitle")} />
      ) : (
        <EmptyState
          title={t("catalog.emptyTitle")}
          description={t("catalog.emptyDescription")}
          action={<NewCatalogItemButton defaultCurrency={defaultCurrency} variant="secondary" />}
        />
      )}
    </>
  );
}
