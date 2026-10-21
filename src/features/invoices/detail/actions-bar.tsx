"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Loader2, Pencil, Undo2, Ban } from "lucide-react";
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
import { actionErrorMessage } from "@/lib/validation-message";
import { duplicateInvoiceAction, unmarkPaidAction, voidInvoiceAction } from "../actions";
import type { Invoice } from "../queries";
import { MarkPaidDialog } from "./mark-paid-dialog";
import { ShareMenu } from "./share-menu";

type Busy = "duplicate" | "unmark" | "void" | null;

/**
 * The buttons of the detail page, by stored status. sent / payment_claimed: edit, send, mark paid,
 * duplicate, void. paid: undo paid, duplicate. void: duplicate only.
 */
export function ActionsBar({
  invoiceId,
  number,
  status,
  today,
  publicPath,
}: {
  invoiceId: string;
  number: string;
  status: Invoice["status"];
  today: string;
  /** `/i/<token>`: the client's page. */
  publicPath: string;
}) {
  const t = useTranslations("invoices.detail");
  const tAll = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const open = status === "sent" || status === "payment_claimed";

  async function run(kind: Exclude<Busy, null>, work: () => Promise<void>) {
    setBusy(kind);
    try {
      await work();
    } catch {
      toast.error(tAll("errors.unknown"));
    }
    setBusy(null);
  }

  const duplicate = () =>
    run("duplicate", async () => {
      const result = await duplicateInvoiceAction(invoiceId);
      if (!result.ok) {
        toast.error(actionErrorMessage(tAll, result));
        return;
      }
      // Full navigation, like the editor menu: the new editor starts from a clean slate.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/invoices/${result.data.id}/edit`);
    });

  const unmark = () =>
    run("unmark", async () => {
      const result = await unmarkPaidAction(invoiceId);
      if (!result.ok) {
        toast.error(actionErrorMessage(tAll, result));
        return;
      }
      toast.success(t("toast.unmarkedPaid"));
      router.refresh();
    });

  const voidIt = () =>
    run("void", async () => {
      const result = await voidInvoiceAction(invoiceId);
      setVoidOpen(false);
      if (!result.ok) {
        toast.error(actionErrorMessage(tAll, result));
        return;
      }
      toast.success(t("toast.voided"));
      router.refresh();
    });

  const working = busy !== null;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("actions.label")}>
      {open ? (
        <>
          <MarkPaidDialog invoiceId={invoiceId} number={number} today={today} />
          <ShareMenu invoiceId={invoiceId} variant="secondary" />
          <Button asChild variant="secondary" size="sm">
            <Link href={`/invoices/${invoiceId}/edit`}>
              <Pencil className="size-4" />
              {t("actions.edit")}
            </Link>
          </Button>
        </>
      ) : null}
      {status === "paid" ? (
        <Button variant="secondary" size="sm" disabled={working} onClick={() => void unmark()}>
          {busy === "unmark" ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
          {t("actions.unmarkPaid")}
        </Button>
      ) : null}
      <Button variant="secondary" size="sm" disabled={working} onClick={() => void duplicate()}>
        {busy === "duplicate" ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
        {t("actions.duplicate")}
      </Button>
      {status !== "void" ? (
        <Button asChild variant="secondary" size="sm">
          <a href={publicPath} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-4" />
            {t("actions.viewPublic")}
          </a>
        </Button>
      ) : null}
      {open ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={working}
          onClick={() => setVoidOpen(true)}
          className="text-danger hover:text-danger"
        >
          <Ban className="size-4" />
          {t("actions.void")}
        </Button>
      ) : null}

      <Dialog open={voidOpen} onOpenChange={(next) => (busy === "void" ? undefined : setVoidOpen(next))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("void.title")}</DialogTitle>
            <DialogDescription>{t("void.description", { number })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={busy === "void"} onClick={() => setVoidOpen(false)}>
              {tAll("common.cancel")}
            </Button>
            <Button type="button" variant="destructive" disabled={busy === "void"} onClick={() => void voidIt()}>
              {t("void.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
