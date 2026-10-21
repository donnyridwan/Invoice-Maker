"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { createInvoiceAction } from "./actions";

function SubmitButton({ variant, label }: { variant: ButtonProps["variant"]; label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending}>
      <Plus className="size-4" />
      {label}
    </Button>
  );
}

/** Creates a draft (optionally for `clientId`) and opens it in the editor. */
export function NewInvoiceButton({
  clientId,
  variant = "primary",
}: {
  clientId?: string;
  variant?: ButtonProps["variant"];
}) {
  const t = useTranslations("invoices");
  return (
    <form action={createInvoiceAction}>
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
      <SubmitButton variant={variant} label={clientId ? t("newForClient") : t("new")} />
    </form>
  );
}
