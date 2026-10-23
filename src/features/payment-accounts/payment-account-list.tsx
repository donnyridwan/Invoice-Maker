"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CreditCard,
  Globe,
  Landmark,
  MoreHorizontal,
  Plus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import type { ActionResult } from "@/lib/action-result";
import {
  archivePaymentAccountAction,
  restorePaymentAccountAction,
  setDefaultPaymentAccountAction,
} from "./actions";
import { PaymentAccountForm } from "./payment-account-form";
import type { PaymentAccount } from "./queries";
import type { PaymentAccountType } from "./schema";
import { summarizePaymentAccount } from "./summary";

const TYPE_ICONS: Record<PaymentAccountType, LucideIcon> = {
  bank: Landmark,
  paypal: Wallet,
  wise: Globe,
  swift: CreditCard,
  other: Banknote,
};

export function PaymentAccountList({ accounts }: { accounts: PaymentAccount[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<PaymentAccount | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [, startTransition] = useTransition();

  const visible = showArchived ? accounts : accounts.filter((a) => !a.archivedAt);
  const hasArchived = accounts.some((a) => a.archivedAt);

  function openForm(account: PaymentAccount | null) {
    setEditing(account);
    setFormOpen(true);
  }

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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {hasArchived ? (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="size-4 accent-accent"
            />
            {t("paymentAccounts.showArchived")}
          </label>
        ) : (
          <span />
        )}
        <Button onClick={() => openForm(null)}>
          <Plus className="size-4" />
          {t("paymentAccounts.new")}
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={t("paymentAccounts.emptyTitle")}
          description={t("paymentAccounts.emptyDescription")}
          action={
            <Button variant="secondary" onClick={() => openForm(null)}>
              <Plus className="size-4" />
              {t("paymentAccounts.new")}
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((account) => {
            const { title, subtitle } = summarizePaymentAccount(account);
            const Icon = TYPE_ICONS[account.type];
            const archived = Boolean(account.archivedAt);
            return (
              <li key={account.id}>
                <Card className={`flex items-center gap-4 p-4 ${archived ? "opacity-60" : ""}`}>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-tile text-fg">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-fg">{title}</p>
                      {account.isDefault ? <Badge variant="info">{t("paymentAccounts.default")}</Badge> : null}
                      {archived ? <Badge>{t("paymentAccounts.archived")}</Badge> : null}
                      <Badge>{account.currency ?? t("paymentAccounts.anyCurrency")}</Badge>
                    </div>
                    {subtitle ? <p className="truncate text-sm text-muted">{subtitle}</p> : null}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" aria-label={t("common.actions")} className="px-2">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {archived ? (
                        <DropdownMenuItem onSelect={() => run(() => restorePaymentAccountAction(account.id))}>
                          {t("common.restore")}
                        </DropdownMenuItem>
                      ) : (
                        <>
                          <DropdownMenuItem onSelect={() => openForm(account)}>{t("common.edit")}</DropdownMenuItem>
                          {account.isDefault ? null : (
                            <DropdownMenuItem
                              onSelect={() => run(() => setDefaultPaymentAccountAction(account.id))}
                            >
                              {t("paymentAccounts.makeDefault")}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onSelect={() => run(() => archivePaymentAccountAction(account.id))}>
                            {t("common.archive")}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <PaymentAccountForm account={editing} open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
