"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitPaymentClaimAction } from "@/features/payment-claims/actions";
import { useServerForm } from "@/lib/use-server-form";

type Props = {
  token: string;
  business: string;
  /** Pre-filled amount, formatted for the invoice language. */
  defaultAmount: string;
  /** Today (Asia/Jakarta) as YYYY-MM-DD: the default payment date. */
  today: string;
  /** Latest accepted payment date (tomorrow), as YYYY-MM-DD. */
  maxDate: string;
  /** The invoice already has the maximum number of pending claims: no new one can be started. */
  limitReached: boolean;
};

/**
 * "Saya sudah bayar": the button and the dialog with the claim form. The dialog stays mounted
 * even when the trigger is hidden, so the thank-you view survives a refresh of the page data.
 */
export function ClaimDialog({ token, business, defaultAmount, today, maxDate, limitReached }: Props) {
  const t = useTranslations("public");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const form = useServerForm<FormData>((formData) => submitPaymentClaimAction(token, formData));

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next && done) {
      setDone(false);
      router.refresh();
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await form.submit(new FormData(event.currentTarget))) setDone(true);
  }

  const formLevelError = form.errorFor("_form") ?? form.formError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {limitReached ? null : (
        <DialogTrigger asChild>
          <Button>{t("claimButton")}</Button>
        </DialogTrigger>
      )}
      <DialogContent>
        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CircleCheck className="size-10 text-badge-success-fg" aria-hidden />
            <DialogTitle>{t("claim.thanks", { business })}</DialogTitle>
            <DialogDescription>{t("claim.thanksDescription")}</DialogDescription>
            <DialogClose asChild>
              <Button variant="secondary">{t("claim.close")}</Button>
            </DialogClose>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>{t("claim.title")}</DialogTitle>
              <DialogDescription>{t("claim.description", { business })}</DialogDescription>
            </DialogHeader>
            <FormField label={t("claim.payerName")} htmlFor="claim-payer" error={form.errorFor("payerName")}>
              <Input id="claim-payer" name="payerName" autoComplete="name" aria-invalid={Boolean(form.errorFor("payerName"))} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t("claim.paidOn")} htmlFor="claim-paid-on" error={form.errorFor("paidOn")}>
                <Input
                  id="claim-paid-on"
                  name="paidOn"
                  type="date"
                  defaultValue={today}
                  max={maxDate}
                  aria-invalid={Boolean(form.errorFor("paidOn"))}
                />
              </FormField>
              <FormField label={t("claim.amount")} htmlFor="claim-amount" error={form.errorFor("amountMinor")}>
                <Input
                  id="claim-amount"
                  name="amount"
                  inputMode="decimal"
                  defaultValue={defaultAmount}
                  className="text-right tabular-nums"
                  aria-invalid={Boolean(form.errorFor("amountMinor"))}
                />
              </FormField>
            </div>
            <FormField label={t("claim.note")} htmlFor="claim-note" error={form.errorFor("note")}>
              <Textarea id="claim-note" name="note" rows={2} placeholder={t("claim.notePlaceholder")} />
            </FormField>
            <FormField
              label={t("claim.proof")}
              htmlFor="claim-proof"
              error={form.errorFor("file")}
              hint={t("claim.proofHint")}
            >
              <input
                id="claim-proof"
                name="proof"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="block w-full text-sm text-muted file:mr-3 file:h-9 file:rounded-md file:border file:border-border file:bg-white file:px-3 file:text-sm file:font-medium file:text-fg hover:file:bg-subtle"
              />
            </FormField>
            {formLevelError ? (
              <p role="alert" className="text-sm text-danger">
                {formLevelError}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  {t("claim.cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={form.pending}>
                {t("claim.submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
