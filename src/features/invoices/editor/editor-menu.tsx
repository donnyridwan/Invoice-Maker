"use client";

import { useState } from "react";
import { Copy, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteDraftInvoiceAction, duplicateInvoiceAction } from "../actions";
import type { Invoice } from "../queries";

/**
 * The ⋯ menu of the editor header: duplicate (any status) and delete (drafts only, after a
 * confirmation). Both end in a full page navigation, so the editor never autosaves a deleted draft.
 */
export function EditorMenu({
  invoiceId,
  number,
  status,
  flush,
  cancel,
}: {
  invoiceId: string;
  number: string;
  status: Invoice["status"];
  /** Writes pending edits (so a duplicate has them). */
  flush: () => Promise<void>;
  /** Drops pending edits (so a deleted draft is not written again); called once the delete succeeded. */
  cancel: () => void;
}) {
  const t = useTranslations("invoices.editor.menu");
  const tAll = useTranslations();
  const [busy, setBusy] = useState<"duplicate" | "delete" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function duplicate() {
    setBusy("duplicate");
    try {
      await flush();
      const result = await duplicateInvoiceAction(invoiceId);
      if (result.ok) {
        // A full navigation (as the brief asks): the new editor starts from a clean slate.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/invoices/${result.data.id}/edit`);
        return;
      }
      toast.error(tAll(`errors.${result.error}`));
    } catch {
      toast.error(tAll("errors.unknown"));
    }
    setBusy(null);
  }

  async function remove() {
    setBusy("delete");
    try {
      const result = await deleteDraftInvoiceAction(invoiceId);
      if (result.ok) {
        // Only now drop pending edits (so the deleted draft is not written again); if the delete
        // fails they stay scheduled and are saved as usual.
        cancel();
        // Full navigation too: nothing of the deleted draft stays in the client router cache.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/invoices");
        return;
      }
      toast.error(tAll(`errors.${result.error}`));
    } catch {
      toast.error(tAll("errors.unknown"));
    }
    setBusy(null);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={t("actions")} disabled={busy !== null} className="px-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => void duplicate()}>
            <Copy className="size-4 text-muted" />
            {t("duplicate")}
          </DropdownMenuItem>
          {status === "draft" ? (
            <DropdownMenuItem onSelect={() => setConfirmOpen(true)} className="text-danger">
              <Trash2 className="size-4" />
              {t("delete")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={(open) => (busy === "delete" ? undefined : setConfirmOpen(open))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteDescription", { number: number.trim() || "—" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={busy === "delete"} onClick={() => setConfirmOpen(false)}>
              {tAll("common.cancel")}
            </Button>
            <Button type="button" variant="destructive" disabled={busy === "delete"} onClick={() => void remove()}>
              {t("confirmDelete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
