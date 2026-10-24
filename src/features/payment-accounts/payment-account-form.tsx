"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
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
import { CUSTOM_FIELD_COUNT, customFieldKeys, PAYMENT_ACCOUNT_TYPES, type PaymentAccountType } from "./schema";

type FieldSpec = { name: string; required?: boolean; multiline?: boolean; inputType?: string; placeholder?: boolean };

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
  // The method's name and free-form instructions; its label + value rows are edited separately.
  other: [
    { name: "methodName", required: true, placeholder: true },
    { name: "instructions", multiline: true },
  ],
};

type CustomRow = { label: string; value: string };

/** The rows a custom method was saved with, or one empty row to start from. */
function initialRows(details: Record<string, string> | undefined): CustomRow[] {
  const rows = Array.from({ length: CUSTOM_FIELD_COUNT }, (_, index) => {
    const keys = customFieldKeys(index + 1);
    return { label: details?.[keys.label] ?? "", value: details?.[keys.value] ?? "" };
  }).filter((row) => row.label || row.value);
  return rows.length > 0 ? rows : [{ label: "", value: "" }];
}

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
  const [rows, setRows] = useState<CustomRow[]>(() => initialRows(account?.details));
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
    if (type === "other") {
      rows.forEach((row, index) => {
        const keys = customFieldKeys(index + 1);
        details[keys.label] = row.label;
        details[keys.value] = row.value;
      });
    }

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

  function changeRow(index: number, patch: Partial<CustomRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  // The label + value rows of a custom method, between its name and its instructions.
  const customRows = (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-1.5 p-0 text-[13px] text-[#606060]">{t("paymentAccounts.fields.customFields")}</legend>
      {rows.map((row, index) => {
        const keys = customFieldKeys(index + 1);
        const rowError = errorFor(keys.label) ?? errorFor(keys.value);
        return (
          <div key={index} className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <Input
                aria-label={t("paymentAccounts.fields.customLabel", { n: index + 1 })}
                placeholder={t("paymentAccounts.fields.customLabelPlaceholder")}
                value={row.label}
                aria-invalid={errorFor(keys.label) ? true : undefined}
                onChange={(e) => changeRow(index, { label: e.target.value })}
                className="w-2/5"
              />
              <Input
                aria-label={t("paymentAccounts.fields.customValue", { n: index + 1 })}
                placeholder={t("paymentAccounts.fields.customValuePlaceholder")}
                value={row.value}
                aria-invalid={errorFor(keys.value) ? true : undefined}
                onChange={(e) => changeRow(index, { value: e.target.value })}
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={t("paymentAccounts.fields.removeField", { n: index + 1 })}
                disabled={rows.length === 1}
                onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                className="size-9 shrink-0 px-0 text-muted hover:text-danger"
              >
                <X className="size-4" />
              </Button>
            </div>
            {rowError ? <p className="text-xs text-danger">{translateValidation(t, rowError)}</p> : null}
          </div>
        );
      })}
      {rows.length < CUSTOM_FIELD_COUNT ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setRows((current) => [...current, { label: "", value: "" }])}
          className="self-start text-muted hover:text-fg"
        >
          <Plus className="size-4" />
          {t("paymentAccounts.fields.addField")}
        </Button>
      ) : null}
    </fieldset>
  );

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
        // A custom method's rows sit between its name and its instructions.
        const before = type === "other" && field.name === "instructions" ? customRows : null;
        const error = errorFor(field.name);
        const Control = field.multiline ? Textarea : Input;
        return (
          <div key={field.name} className="contents">
            {before}
            <div className="flex flex-col gap-1.5">
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
                placeholder={field.placeholder ? t(`paymentAccounts.placeholders.${field.name}`) : undefined}
                aria-invalid={error ? true : undefined}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
              />
              {error ? <p className="text-xs text-danger">{translateValidation(t, error)}</p> : null}
            </div>
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
