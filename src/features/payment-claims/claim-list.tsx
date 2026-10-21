"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Paperclip, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CurrencyCode } from "@/lib/currencies";
import { formatDocDate } from "@/lib/dates";
import { resolveLocale } from "@/i18n/config";
import { formatMoney } from "@/lib/money";
import { actionErrorMessage } from "@/lib/validation-message";
import { acceptClaimAction, rejectClaimAction } from "./actions";

export type ClaimListItem = {
  id: string;
  payerName: string;
  paidOn: string;
  amountMinor: number;
  note: string | null;
  proofUrl: string | null;
};

/**
 * The claims waiting for the owner's decision: who says they paid, when and how much, the note
 * and the proof, with "Konfirmasi lunas" (invoice becomes paid) and "Tolak".
 */
export function ClaimList({ claims, currency }: { claims: ClaimListItem[]; currency: CurrencyCode }) {
  const t = useTranslations("invoices.detail");
  const tAll = useTranslations();
  const locale = resolveLocale(useLocale());
  const router = useRouter();
  const [busy, setBusy] = useState<{ id: string; kind: "accept" | "reject" } | null>(null);

  async function decide(id: string, kind: "accept" | "reject") {
    setBusy({ id, kind });
    try {
      const result = await (kind === "accept" ? acceptClaimAction(id) : rejectClaimAction(id));
      if (result.ok) {
        toast.success(t(kind === "accept" ? "toast.claimAccepted" : "toast.claimRejected"));
      } else {
        toast.error(actionErrorMessage(tAll, result));
      }
      // Also after a failure (e.g. the claim was decided elsewhere): show the current state.
      router.refresh();
    } catch {
      toast.error(tAll("errors.unknown"));
    }
    setBusy(null);
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {claims.map((claim) => {
        const working = busy?.id === claim.id;
        return (
          <li key={claim.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium text-fg">{claim.payerName}</span>
              <span className="whitespace-nowrap font-medium tabular-nums text-fg">
                {formatMoney(claim.amountMinor, currency, locale)}
              </span>
            </div>
            <p className="text-xs text-muted">{t("claims.paidOn", { date: formatDocDate(claim.paidOn, locale) })}</p>
            {claim.note ? <p className="whitespace-pre-line break-words text-sm text-fg">{claim.note}</p> : null}
            {claim.proofUrl ? (
              <a
                href={claim.proofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-accent hover:underline"
              >
                <Paperclip className="size-3.5" aria-hidden />
                {t("claims.viewProof")}
              </a>
            ) : null}
            <div className="flex gap-2 pt-1">
              <Button size="sm" disabled={working} onClick={() => void decide(claim.id, "accept")}>
                {working && busy?.kind === "accept" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {t("claims.accept")}
              </Button>
              <Button variant="secondary" size="sm" disabled={working} onClick={() => void decide(claim.id, "reject")}>
                {working && busy?.kind === "reject" ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                {t("claims.reject")}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
