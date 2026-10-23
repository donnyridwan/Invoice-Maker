"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Package, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { IconTile } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActionResult } from "@/lib/action-result";
import { resolveLocale } from "@/i18n/config";
import { isCurrencyCode } from "@/lib/currencies";
import { formatMoney } from "@/lib/money";
import { archiveCatalogItemAction, restoreCatalogItemAction } from "./actions";
import { CatalogForm } from "./catalog-form";
import type { CatalogItem } from "./queries";

export function NewCatalogItemButton({
  defaultCurrency,
  variant = "primary",
}: {
  defaultCurrency: string;
  variant?: "primary" | "secondary";
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {t("catalog.new")}
      </Button>
      <CatalogForm item={null} defaultCurrency={defaultCurrency} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function CatalogTable({ items, defaultCurrency }: { items: CatalogItem[]; defaultCurrency: string }) {
  const t = useTranslations();
  const locale = resolveLocale(useLocale());
  const router = useRouter();
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(t("common.saved"));
        router.refresh();
      } else {
        toast.error(t(`errors.${result.error}`));
      }
    });
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("catalog.name")}</TableHead>
            <TableHead>{t("catalog.unit")}</TableHead>
            <TableHead className="text-right">{t("catalog.unitPrice")}</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">{t("common.actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const archived = Boolean(item.archivedAt);
            return (
              <TableRow key={item.id} className={archived ? "text-muted" : undefined}>
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-3">
                    <IconTile icon={Package} />
                    <div className="min-w-0">
                      <span className="font-medium text-fg">{item.name}</span>
                      {archived ? <Badge className="ml-2 align-middle">{t("catalog.archived")}</Badge> : null}
                      {item.description ? (
                        <p className="max-w-md truncate text-xs text-muted">{item.description}</p>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted">{item.unit ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {isCurrencyCode(item.currency)
                    ? formatMoney(item.unitPriceMinor, item.currency, locale)
                    : `${item.currency} ${item.unitPriceMinor}`}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" aria-label={t("common.actions")} className="px-2">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {archived ? (
                        <DropdownMenuItem onSelect={() => run(() => restoreCatalogItemAction(item.id))}>
                          {t("common.restore")}
                        </DropdownMenuItem>
                      ) : (
                        <>
                          <DropdownMenuItem
                            onSelect={() => {
                              setEditing(item);
                              setFormOpen(true);
                            }}
                          >
                            {t("common.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => run(() => archiveCatalogItemAction(item.id))}>
                            {t("common.archive")}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <CatalogForm item={editing} defaultCurrency={defaultCurrency} open={formOpen} onOpenChange={setFormOpen} />
    </>
  );
}
