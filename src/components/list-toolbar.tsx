import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Active/Archived tabs plus a search box for a list page. State lives in the URL (`q`, `tab`), so
 * it works without JavaScript and the page stays a server component.
 */
export function ListToolbar({
  basePath,
  q,
  archived,
  tabsLabel,
  searchLabel,
  searchPlaceholder,
  activeLabel,
  archivedLabel,
}: {
  basePath: string;
  q: string;
  archived: boolean;
  tabsLabel: string;
  searchLabel: string;
  searchPlaceholder: string;
  activeLabel: string;
  archivedLabel: string;
}) {
  const tabHref = (tab: "active" | "archived") => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (tab === "archived") query.set("tab", "archived");
    const qs = query.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="mb-2 flex flex-col gap-4">
      <nav aria-label={tabsLabel} className="flex border-b border-border">
        {(["active", "archived"] as const).map((tab) => {
          const current = (tab === "archived") === archived;
          return (
            <Link
              key={tab}
              href={tabHref(tab)}
              aria-current={current ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex h-10 items-center border-b px-3 text-sm first:pl-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                current ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg",
              )}
            >
              {tab === "active" ? activeLabel : archivedLabel}
            </Link>
          );
        })}
      </nav>
      <form action={basePath} method="get" role="search" className="relative w-full sm:w-80">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        {archived ? <input type="hidden" name="tab" value="archived" /> : null}
        <Input
          name="q"
          type="search"
          defaultValue={q}
          aria-label={searchLabel}
          placeholder={searchPlaceholder}
          className="pl-9"
        />
      </form>
    </div>
  );
}
