"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCY_CODES } from "@/lib/currencies";
import { translateValidation } from "@/lib/validation-message";
import { savePaymentAccountAction } from "./actions";
import type { PaymentAccount } from "./queries";
import { PAYMENT_ACCOUNT_TYPES, type PaymentAccountType } from "./schema";

type FieldSpec = { name: string; required?: boolean; multiline?: boolean; inputType?: string };

const FIELDS: Record<PaymentAccountType, FieldSpec[]> = {
  bank: [
    { name: "bankName", required: true },
    { name: "accountName", required: true },
    { name: "accountNumber", required: true },
  ],
  paypal: [{ name: "email", required: true, inputType: "email" }],
  wise: [
    { name: "accountName", required: true },
    { name: "email", inputType: "email" },
    { name: "accountNumber" },
    { name: "iban" },
  ],
  swift: [
    { name: "bankName", required: true },
    { name: "accountName", required: true },
    { name: "swift", required: true },
    { name: "accountNumber" },
    { name: "iban" },
  ],
  other: [{ name: "instructions", required: true, multiline: true }],
};

const ANY_CURRENCY = "__any";

const defaultCurrency = (type: PaymentAccountType) => (type === "bank" ? "IDR" : "USD");

export function PaymentAccountForm({
  account,
  open,
  onOpenChange,
}: {
  account: PaymentAccount | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Remount on each open so the form always starts from the account being edited.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <FormBody key={account?.id ?? "new"} account={account} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function FormBody({ account, onDone }: { account: PaymentAccount | null; onDone: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const [type, setType] = useState<PaymentAccountType>(account?.type ?? "bank");
  const [label, setLabel] = useState(account?.label ?? "");
  const [currency, setCurrency] = useState(account ? (account.currency ?? "") : "IDR");
  const [isDefault, setIsDefault] = useState(account?.isDefault ?? false);
  const [values, setValues] = useState<Record<string, string>>(account?.details ?? {});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function changeType(next: PaymentAccountType) {
    setType(next);
    if (!account) setCurrency(defaultCurrency(next));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const details: Record<string, string> = {};
    for (const field of FIELDS[type]) details[field.name] = values[field.name] ?? "";

    setPending(true);
    setFormError(null);
    setFieldErrors({});
    const result = await savePaymentAccountAction(account?.id ?? null, {
      type,
      label,
      currency,
      isDefault,
      ...details,
    });
    setPending(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      setFormError(result.fieldErrors ? null : t(`errors.${result.error}`));
      return;
    }
    toast.success(t("common.saved"));
    router.refresh();
    onDone();
  }

  const errorFor = (name: string) => fieldErrors[name]?.[0];

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{account ? t("paymentAccounts.edit") : t("paymentAccounts.new")}</DialogTitle>
        <DialogDescription>{t("paymentAccounts.description")}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pa-type">{t("paymentAccounts.type")}</Label>
        <Select value={type} onValueChange={(v) => changeType(v as PaymentAccountType)} disabled={Boolean(account)}>
          <SelectTrigger id="pa-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_ACCOUNT_TYPES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`paymentAccounts.types.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {FIELDS[type].map((field) => {
        const id = `pa-${field.name}`;
        const error = errorFor(field.name);
        const Control = field.multiline ? Textarea : Input;
        return (
          <div key={field.name} className="flex flex-col gap-1.5">
            <Label htmlFor={id}>
              {t(`paymentAccounts.fields.${field.name}`)}
              {field.required ? null : (
                <span className="font-normal text-muted"> ({t("common.optional")})</span>
              )}
            </Label>
            <Control
              id={id}
              name={field.name}
              {...(field.multiline ? {} : { type: field.inputType ?? "text" })}
              value={values[field.name] ?? ""}
              aria-invalid={error ? true : undefined}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
            />
            {error ? <p className="text-xs text-danger">{translateValidation(t, error)}</p> : null}
          </div>
        );
      })}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pa-label">
            {t("paymentAccounts.label")}
            <span className="font-normal text-muted"> ({t("common.optional")})</span>
          </Label>
          <Input
            id="pa-label"
            value={label}
            aria-invalid={errorFor("label") ? true : undefined}
            onChange={(e) => setLabel(e.target.value)}
          />
          {errorFor("label") ? (
            <p className="text-xs text-danger">{translateValidation(t, errorFor("label")!)}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pa-currency">{t("paymentAccounts.currency")}</Label>
          <Select
            value={currency || ANY_CURRENCY}
            onValueChange={(value) => setCurrency(value === ANY_CURRENCY ? "" : value)}
          >
            <SelectTrigger id="pa-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_CURRENCY}>{t("paymentAccounts.anyCurrency")}</SelectItem>
              {CURRENCY_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="size-4 accent-accent"
        />
        {t("paymentAccounts.isDefault")}
      </label>

      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {t("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
