import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { ClientTable } from "@/features/clients/client-table";
import { listClients } from "@/features/clients/queries";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const user = await requireUser();
  const t = await getTranslations();
  const params = await searchParams;
  const q = first(params.q)?.trim() ?? "";
  const archived = first(params.tab) === "archived";

  const found = await listClients(user.id, { search: q, includeArchived: archived });
  const clients = archived ? found.filter((c) => c.archivedAt) : found;

  const tabHref = (tab: "active" | "archived") => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (tab === "archived") query.set("tab", "archived");
    const qs = query.toString();
    return qs ? `/clients?${qs}` : "/clients";
  };

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

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label={t("clients.title")} className="flex gap-1 rounded-md border border-border bg-white p-0.5">
          {(["active", "archived"] as const).map((tab) => {
            const current = (tab === "archived") === archived;
            return (
              <Link
                key={tab}
                href={tabHref(tab)}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "rounded px-3 py-1 text-sm font-medium",
                  current ? "bg-subtle text-fg" : "text-muted hover:text-fg",
                )}
              >
                {tab === "active" ? t("clients.tabActive") : t("clients.tabArchived")}
              </Link>
            );
          })}
        </nav>
        <form action="/clients" method="get" role="search" className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          {archived ? <input type="hidden" name="tab" value="archived" /> : null}
          <Input
            name="q"
            type="search"
            defaultValue={q}
            aria-label={t("clients.searchLabel")}
            placeholder={t("clients.searchPlaceholder")}
            className="pl-9"
          />
        </form>
      </div>

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
