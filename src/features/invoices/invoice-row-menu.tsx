"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  CircleCheck,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Link2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Undo2,
} from "lucide-react";
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
import { actionErrorMessage } from "@/lib/validation-message";
import {
  copyLinkAction,
  deleteInvoiceAction,
  duplicateInvoiceAction,
  unmarkPaidAction,
  voidInvoiceAction,
} from "./actions";
import { MarkPaidDialog } from "./detail/mark-paid-dialog";
import type { Invoice } from "./queries";

type Busy = "copy" | "duplicate" | "unmark" | "void" | "delete" | null;

/**
 * The ⋯ menu at the end of an invoice row: the same actions as the detail page and the editor menu,
 * by stored status. draft: edit, PDF, duplicate, delete. sent / payment_claimed: view, edit, PDF,
 * copy link, client page, mark paid, duplicate, void. paid: view, PDF, copy link, client page, undo
 * paid, duplicate. void: view, PDF, duplicate, delete.
 */
export function InvoiceRowMenu({
  invoice,
  today,
}: {
  invoice: Pick<Invoice, "id" | "number" | "status" | "publicToken">;
  /** Today in Asia/Jakarta (YYYY-MM-DD), for the mark-paid dialog. */
  today: string;
}) {
  const t = useTranslations("invoices");
  const tAll = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [confirm, setConfirm] = useState<"void" | "delete" | null>(null);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);

  const { id, number, status } = invoice;
  const draft = status === "draft";
  const open = status === "sent" || status === "payment_claimed";
  const editable = draft || open;
  const shared = open || status === "paid";
  // Drafts and voided invoices can be deleted for good.
  const deletable = draft || status === "void";

  async function run(kind: Exclude<Busy, null>, work: () => Promise<void>) {
    setBusy(kind);
    try {
      await work();
    } catch {
      toast.error(tAll("errors.unknown"));
    }
    setBusy(null);
  }

  const copyLink = () =>
    run("copy", async () => {
      const result = await copyLinkAction(id);
      if (!result.ok) {
        toast.error(actionErrorMessage(tAll, result));
        return;
      }
      try {
        await navigator.clipboard.writeText(result.data.url);
        toast.success(t("detail.toast.linkCopied"));
      } catch {
        // No clipboard access: show the link to copy by hand.
        toast.message(t("detail.toast.copyFailed", { url: result.data.url }));
      }
      router.refresh();
    });

  const duplicate = () =>
    run("duplicate", async () => {
      const result = await duplicateInvoiceAction(id);
      if (!result.ok) {
        toast.error(actionErrorMessage(tAll, result));
        return;
      }
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/invoices/${result.data.id}/edit`);
    });

  const unmark = () =>
    run("unmark", async () => {
      const result = await unmarkPaidAction(id);
      if (!result.ok) {
        toast.error(actionErrorMessage(tAll, result));
        return;
      }
      toast.success(t("detail.toast.unmarkedPaid"));
      router.refresh();
    });

  const confirmed = () =>
    run(confirm === "void" ? "void" : "delete", async () => {
      const result = confirm === "void" ? await voidInvoiceAction(id) : await deleteInvoiceAction(id);
      setConfirm(null);
      if (!result.ok) {
        toast.error(actionErrorMessage(tAll, result));
        return;
      }
      if (confirm === "void") toast.success(t("detail.toast.voided"));
      else if (!draft) toast.success(t("detail.delete.toast"));
      router.refresh();
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("rowActions", { number })}
            disabled={busy !== null}
            // Above the row-wide link, so the menu opens instead of the invoice.
            className="relative z-10 size-8 px-0"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {draft ? null : (
            <DropdownMenuItem asChild>
              <Link href={`/invoices/${id}`}>
                <Eye className="size-4 text-muted" />
                {t("editor.view")}
              </Link>
            </DropdownMenuItem>
          )}
          {editable ? (
            <DropdownMenuItem asChild>
              <Link href={`/invoices/${id}/edit`}>
                <Pencil className="size-4 text-muted" />
                {t("detail.actions.edit")}
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <a href={`/api/invoices/${id}/pdf`} download>
              <Download className="size-4 text-muted" />
              {t("detail.actions.downloadPdf")}
            </a>
          </DropdownMenuItem>
          {shared ? (
            <>
              <DropdownMenuItem onSelect={() => void copyLink()}>
                <Link2 className="size-4 text-muted" />
                {t("detail.actions.copyLink")}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`/i/${invoice.publicToken}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4 text-muted" />
                  {t("detail.actions.viewPublic")}
                </a>
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          {open ? (
            <DropdownMenuItem onSelect={() => setMarkPaidOpen(true)}>
              <CircleCheck className="size-4 text-muted" />
              {t("detail.actions.markPaid")}
            </DropdownMenuItem>
          ) : null}
          {status === "paid" ? (
            <DropdownMenuItem onSelect={() => void unmark()}>
              <Undo2 className="size-4 text-muted" />
              {t("detail.actions.unmarkPaid")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => void duplicate()}>
            <Copy className="size-4 text-muted" />
            {t("detail.actions.duplicate")}
          </DropdownMenuItem>
          {open || deletable ? <DropdownMenuSeparator /> : null}
          {open ? (
            <DropdownMenuItem onSelect={() => setConfirm("void")} className="text-danger">
              <Ban className="size-4" />
              {t("detail.actions.void")}
            </DropdownMenuItem>
          ) : null}
          {deletable ? (
            <DropdownMenuItem onSelect={() => setConfirm("delete")} className="text-danger">
              <Trash2 className="size-4" />
              {draft ? t("editor.menu.delete") : t("detail.delete.action")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {open ? (
        <MarkPaidDialog invoiceId={id} number={number} today={today} open={markPaidOpen} onOpenChange={setMarkPaidOpen} />
      ) : null}

      <Dialog open={confirm !== null} onOpenChange={(next) => (busy ? undefined : !next && setConfirm(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "void" ? t("detail.void.title") : draft ? t("editor.menu.deleteTitle") : t("detail.delete.title")}
            </DialogTitle>
            <DialogDescription>
              {confirm === "void"
                ? t("detail.void.description", { number })
                : draft
                  ? t("editor.menu.deleteDescription", { number })
                  : t("detail.delete.description", { number })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => setConfirm(null)}>
              {tAll("common.cancel")}
            </Button>
            <Button type="button" variant="destructive" disabled={busy !== null} onClick={() => void confirmed()}>
              {confirm === "void" ? t("detail.void.confirm") : draft ? t("editor.menu.confirmDelete") : t("detail.delete.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
