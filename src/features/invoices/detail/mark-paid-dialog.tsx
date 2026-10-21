"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
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
import { useServerForm } from "@/lib/use-server-form";
import { markPaidAction } from "../actions";

/** "Tandai lunas": the button and a dialog asking for the payment date (default today) and a note. */
export function MarkPaidDialog({
  invoiceId,
  number,
  today,
  variant = "primary",
}: {
  invoiceId: string;
  number: string;
  /** Today in Asia/Jakarta (YYYY-MM-DD): the default and the latest payment date. */
  today: string;
  variant?: ButtonProps["variant"];
}) {
  const t = useTranslations("invoices.detail");
  const tAll = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useServerForm<{ paidOn: string; note: string }>((values) => markPaidAction(invoiceId, values));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const ok = await form.submit({ paidOn: String(data.get("paidOn") ?? ""), note: String(data.get("note") ?? "") });
    if (ok) {
      setOpen(false);
      toast.success(t("toast.markedPaid"));
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (form.pending ? undefined : setOpen(next))}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          <CircleCheck className="size-4" />
          {t("actions.markPaid")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t("markPaid.title")}</DialogTitle>
            <DialogDescription>{t("markPaid.description", { number })}</DialogDescription>
          </DialogHeader>
          <FormField label={t("markPaid.paidOn")} htmlFor="mark-paid-on" error={form.errorFor("paidOn")}>
            <Input
              id="mark-paid-on"
              name="paidOn"
              type="date"
              defaultValue={today}
              max={today}
              aria-invalid={Boolean(form.errorFor("paidOn"))}
            />
          </FormField>
          <FormField label={t("markPaid.note")} htmlFor="mark-paid-note" error={form.errorFor("note")}>
            <Textarea id="mark-paid-note" name="note" rows={2} placeholder={t("markPaid.notePlaceholder")} />
          </FormField>
          {form.errorFor("_form") ?? form.formError ? (
            <p role="alert" className="text-sm text-danger">
              {form.errorFor("_form") ?? form.formError}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                {tAll("common.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={form.pending}>
              {tAll("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
