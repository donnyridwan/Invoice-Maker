"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, ChevronDown, Link2, Loader2, Mail, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { actionErrorMessage } from "@/lib/validation-message";
import { copyLinkAction, markSentAction } from "../actions";
import { SendEmailDialog } from "../send-email-dialog";

/**
 * "Kirim" with its dropdown: email the invoice (only offered when email delivery is configured),
 * copy the public link (which also sends a draft) or mark the invoice as sent by hand. `flush` writes pending editor changes first, so the send requirements are
 * checked against what the user sees. The page is refreshed afterwards to show the new status.
 */
export function ShareMenu({
  invoiceId,
  flush,
  emailEnabled = false,
  variant = "primary",
}: {
  invoiceId: string;
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

  async function run(work: () => Promise<void>) {
    setBusy(true);
    try {
      await flush?.();
      await work();
    } catch {
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
          <DropdownMenuItem onSelect={() => void copyLink()}>
            <Link2 className="size-4 text-muted" />
            {t("actions.copyLink")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void markSent()}>
            <CheckCheck className="size-4 text-muted" />
            {t("actions.markSent")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {emailEnabled ? (
        <SendEmailDialog invoiceId={invoiceId} open={emailOpen} onOpenChange={setEmailOpen} flush={flush} />
      ) : null}
    </>
  );
}
