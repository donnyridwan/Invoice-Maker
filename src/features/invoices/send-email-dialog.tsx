"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip } from "lucide-react";
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
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { settleAction } from "@/lib/action-result";
import { authClient } from "@/lib/auth-client";
import { useServerForm } from "@/lib/use-server-form";
import { getEmailDialogDataAction, sendInvoiceEmailAction, type EmailDialogData } from "./actions";

type Values = { to: string; cc: string; subject: string; message: string };

/** "a@x.com, b@y.com" -> ["a@x.com", "b@y.com"] (commas, semicolons and whitespace separate). */
function splitAddresses(value: string): string[] {
  return value.split(/[,;\s]+/).filter(Boolean);
}

/**
 * "Kirim lewat email": a dialog with To (the client's address), CC, subject and message (defaults
 * from the invoice) and a note that the PDF is attached. An account whose email is not verified
 * gets an explanation and a button that mails the verification link instead of the form.
 * `flush` writes pending editor changes first so the defaults match what the user sees.
 */
export function SendEmailDialog({
  invoiceId,
  open,
  onOpenChange,
  flush,
}: {
  invoiceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flush?: () => Promise<void>;
}) {
  // The body reports a send in flight, during which the dialog must not be dismissed.
  const [sending, setSending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => (sending ? undefined : onOpenChange(next))}>
      <DialogContent>
        {/* Mounted only while open, so every opening starts from a fresh state and a fresh load. */}
        <SendEmailBody invoiceId={invoiceId} flush={flush} close={() => onOpenChange(false)} onSending={setSending} />
      </DialogContent>
    </Dialog>
  );
}

function SendEmailBody({
  invoiceId,
  flush,
  close,
  onSending,
}: {
  invoiceId: string;
  flush?: () => Promise<void>;
  close: () => void;
  onSending: (sending: boolean) => void;
}) {
  const t = useTranslations("invoices.detail");
  const tAll = useTranslations();
  const router = useRouter();
  const [data, setData] = useState<EmailDialogData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [values, setValues] = useState<Values>({ to: "", cc: "", subject: "", message: "" });
  const [verificationSent, setVerificationSent] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);

  const form = useServerForm<Values>((v) =>
    sendInvoiceEmailAction(invoiceId, { to: v.to, cc: splitAddresses(v.cc), subject: v.subject, message: v.message }),
  );

  // On mount (each time the dialog opens): write pending changes, then read the defaults and the verified flag.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await flush?.();
      } catch {
        // The defaults below are read from what is saved; a failed flush shows in the editor.
      }
      const result = await settleAction(() => getEmailDialogDataAction(invoiceId));
      if (cancelled) return;
      if (result.ok) {
        setData(result.data);
        setValues({ to: result.data.to, cc: "", subject: result.data.subject, message: result.data.message });
      } else {
        setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `flush` is stable per editor; the load happens once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const { pending: sending } = form;
  useEffect(() => {
    onSending(sending);
    return () => onSending(false);
  }, [onSending, sending]);

  const set = (key: keyof Values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await form.submit(values)) {
      close();
      toast.success(t("toast.emailSent"));
      router.refresh();
    }
  }

  async function sendVerification() {
    if (!data) return;
    setSendingVerification(true);
    try {
      const { error } = await authClient.sendVerificationEmail({
        email: data.accountEmail,
        callbackURL: window.location.pathname,
      });
      if (error) toast.error(tAll("settings.verifyEmail.failed"));
      else setVerificationSent(true);
    } catch {
      toast.error(tAll("settings.verifyEmail.failed"));
    }
    setSendingVerification(false);
  }

  const formError = form.errorFor("_form") ?? form.formError;

  return (
    <>
    {data && !data.verified ? (
      <div className="grid gap-4">
        <DialogHeader>
          <DialogTitle>{t("sendEmail.unverifiedTitle")}</DialogTitle>
          <DialogDescription>{t("sendEmail.unverifiedDescription", { email: data.accountEmail })}</DialogDescription>
        </DialogHeader>
        {verificationSent ? (
          <p role="status" className="text-sm text-muted">
            {t("sendEmail.verificationSent", { email: data.accountEmail })}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={close}>
            {tAll("common.cancel")}
          </Button>
          <Button type="button" disabled={sendingVerification || verificationSent} onClick={() => void sendVerification()}>
            {sendingVerification ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("sendEmail.sendVerification")}
          </Button>
        </DialogFooter>
      </div>
    ) : (
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <DialogHeader>
          <DialogTitle>{t("sendEmail.title")}</DialogTitle>
          <DialogDescription>{t("sendEmail.description")}</DialogDescription>
        </DialogHeader>
        {loadFailed ? (
          <p role="alert" className="text-sm text-danger">
            {t("sendEmail.loadFailed")}
          </p>
        ) : !data ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("sendEmail.loading")}
          </p>
        ) : (
          <>
            <FormField label={t("sendEmail.to")} htmlFor="send-email-to" error={form.errorFor("to")}>
              <Input
                id="send-email-to"
                type="email"
                autoComplete="off"
                value={values.to}
                onChange={set("to")}
                aria-invalid={Boolean(form.errorFor("to"))}
              />
            </FormField>
            <FormField
              label={t("sendEmail.cc")}
              htmlFor="send-email-cc"
              hint={t("sendEmail.ccHint")}
              error={form.errorFor("cc")}
            >
              <Input
                id="send-email-cc"
                autoComplete="off"
                value={values.cc}
                onChange={set("cc")}
                aria-invalid={Boolean(form.errorFor("cc"))}
              />
            </FormField>
            <FormField label={t("sendEmail.subject")} htmlFor="send-email-subject" error={form.errorFor("subject")}>
              <Input
                id="send-email-subject"
                value={values.subject}
                onChange={set("subject")}
                aria-invalid={Boolean(form.errorFor("subject"))}
              />
            </FormField>
            <FormField label={t("sendEmail.message")} htmlFor="send-email-message" error={form.errorFor("message")}>
              <Textarea
                id="send-email-message"
                rows={8}
                value={values.message}
                onChange={set("message")}
                aria-invalid={Boolean(form.errorFor("message"))}
              />
            </FormField>
            <p className="flex items-center gap-2 text-sm text-muted">
              <Paperclip className="size-4 shrink-0" aria-hidden />
              {t("sendEmail.attachmentInfo")}
            </p>
          </>
        )}
        {formError ? (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={form.pending} onClick={close}>
            {tAll("common.cancel")}
          </Button>
          <Button type="submit" disabled={form.pending || !data}>
            {form.pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("sendEmail.send")}
          </Button>
        </DialogFooter>
      </form>
    )}
    </>
  );
}
