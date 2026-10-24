"use client";

import { useState, type MouseEvent } from "react";
import { Copy, Download, Loader2, MoreHorizontal, Repeat, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RecurringDialog } from "@/features/recurring/recurring-dialog";
import { deleteInvoiceAction, duplicateInvoiceAction } from "../actions";
import type { Invoice } from "../queries";

/**
 * The ⋯ menu of the editor header: download the PDF, duplicate (any status), make the invoice
 * recurring (or manage its schedule) and delete (drafts only, after a confirmation). Duplicate and delete end in a full
 * page navigation, so the editor never autosaves a deleted draft.
 */
export function EditorMenu({
  invoiceId,
  number,
  status,
  hasSchedule,
  flush,
  cancel,
}: {
  invoiceId: string;
  number: string;
  status: Invoice["status"];
  /** Whether the invoice already repeats: the entry then manages the schedule instead of creating one. */
  hasSchedule: boolean;
  /** Writes pending edits (so a duplicate and the PDF have them). */
  flush: () => Promise<void>;
  /** Drops pending edits (so a deleted draft is not written again); called once the delete succeeded. */
  cancel: () => void;
}) {
  const t = useTranslations("invoices.editor.menu");
  const tAll = useTranslations();
  const [busy, setBusy] = useState<"duplicate" | "delete" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const tRecurring = useTranslations("recurring");
  const tInvoices = useTranslations("invoices.editor");

  // The PDF is rendered from the saved invoice, so pending edits are written before it is fetched.
  // Modified clicks (new tab, save link as) keep the plain link and its behaviour.
  async function downloadPdf(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const url = event.currentTarget.href;
    try {
      await flush();
    } catch {
      // A failed save shows in the autosave indicator; the PDF then reflects the last saved version.
    }
    window.location.assign(url);
  }

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
      const result = await deleteInvoiceAction(invoiceId);
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
          <Button variant="ghost" size="sm" aria-label={t("actions")} disabled={busy !== null} className="-mr-2 size-8 px-0 text-muted hover:text-fg">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={`/api/invoices/${invoiceId}/pdf`} download onClick={(event) => void downloadPdf(event)}>
              <Download className="size-4 text-muted" />
              {tInvoices("downloadPdf")}
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void duplicate()}>
            <Copy className="size-4 text-muted" />
            {t("duplicate")}
          </DropdownMenuItem>
          {status !== "void" ? (
            <DropdownMenuItem onSelect={() => setRecurringOpen(true)}>
              <Repeat className="size-4 text-muted" />
              {hasSchedule ? tRecurring("editSchedule") : tRecurring("makeRecurring")}
            </DropdownMenuItem>
          ) : null}
          {status === "draft" ? (
            <DropdownMenuItem onSelect={() => setConfirmOpen(true)} className="text-danger">
              <Trash2 className="size-4" />
              {t("delete")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <RecurringDialog
        invoiceId={invoiceId}
        number={number}
        open={recurringOpen}
        onOpenChange={setRecurringOpen}
        flush={flush}
      />

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
