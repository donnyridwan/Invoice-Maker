"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, ChevronDown, Link2, Loader2, Mail, MessageCircle, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { actionErrorMessage } from "@/lib/validation-message";
import { copyLinkAction, markSentAction, shareWhatsAppAction } from "./actions";
import type { Invoice } from "./queries";
import { SendEmailDialog } from "./send-email-dialog";

/**
 * "Kirim", the one send menu of the editor and the detail page: email the invoice (only offered
 * when email delivery is configured; the dialog asks to verify the account first when needed),
 * share it on WhatsApp, copy the public link, or mark it as sent by hand (drafts only). Each of
 * them sends a draft. `flush` writes pending editor changes first, so the send requirements are
 * checked against what the user sees. The page is refreshed afterwards to show the new status.
 */
export function SendMenu({
  invoice,
  flush,
  emailEnabled = false,
  variant = "primary",
}: {
  invoice: Pick<Invoice, "id" | "status">;
  flush?: () => Promise<void>;
  /** Whether the server has an email transport; without one the email option is not shown. */
  emailEnabled?: boolean;
  variant?: ButtonProps["variant"];
}) {
  const t = useTranslations("invoices.detail");
  const tAll = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const invoiceId = invoice.id;

  async function run(work: () => Promise<void>, onFail?: () => void) {
    setBusy(true);
    try {
      await flush?.();
      await work();
    } catch {
      onFail?.();
      toast.error(tAll("errors.unknown"));
    }
    setBusy(false);
  }

  const copyLink = () =>
    run(async () => {
      const result = await copyLinkAction(invoiceId);
      if (!result.ok) {
        toast.error(actionErrorMessage(tAll, result));
        return;
      }
      try {
        await navigator.clipboard.writeText(result.data.url);
        toast.success(t("toast.linkCopied"));
      } catch {
        // No clipboard access (insecure origin, denied permission): show the link to copy by hand.
        toast.message(t("toast.copyFailed", { url: result.data.url }));
      }
      router.refresh();
    });

  // The window is opened synchronously in the click handler (popup blockers only allow that) and
  // pointed at wa.me once the server action has produced the link; it is closed when that fails.
  const whatsApp = () => {
    const popup = window.open("about:blank", "_blank");
    return run(
      async () => {
        const result = await shareWhatsAppAction(invoiceId);
        if (!result.ok) {
          popup?.close();
          toast.error(actionErrorMessage(tAll, result));
          return;
        }
        if (popup) {
          // noopener semantics: wa.me must not get a handle on this window.
          popup.opener = null;
          popup.location.href = result.data.url;
        } else {
          window.open(result.data.url, "_blank", "noopener");
        }
        router.refresh();
      },
      () => popup?.close(),
    );
  };

  const markSent = () =>
    run(async () => {
      const result = await markSentAction(invoiceId);
      if (!result.ok) {
        toast.error(actionErrorMessage(tAll, result));
        return;
      }
      toast.success(t("toast.markedSent"));
      router.refresh();
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant} size="sm" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t("actions.send")}
            <ChevronDown className="size-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {emailEnabled ? (
            <DropdownMenuItem onSelect={() => setEmailOpen(true)}>
              <Mail className="size-4 text-muted" />
              {t("actions.sendEmail")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => void whatsApp()}>
            <MessageCircle className="size-4 text-muted" />
            {t("actions.whatsapp")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyLink()}>
            <Link2 className="size-4 text-muted" />
            {t("actions.copyLink")}
          </DropdownMenuItem>
          {invoice.status === "draft" ? (
            <DropdownMenuItem onSelect={() => void markSent()}>
              <CheckCheck className="size-4 text-muted" />
              {t("actions.markSent")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {emailEnabled ? (
        <SendEmailDialog invoiceId={invoiceId} open={emailOpen} onOpenChange={setEmailOpen} flush={flush} />
      ) : null}
    </>
  );
}
