"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CurrencySelect } from "@/components/currency-select";
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
import { resolveLocale } from "@/i18n/config";
import { isCurrencyCode } from "@/lib/currencies";
import { formatMoneyInput } from "@/lib/money";
import { useServerForm } from "@/lib/use-server-form";
import { saveCatalogItemAction } from "./actions";
import type { CatalogItem } from "./queries";
import type { CatalogFormValues } from "./schema";

export function CatalogForm({
  item,
  defaultCurrency,
  open,
  onOpenChange,
}: {
  item: CatalogItem | null;
  defaultCurrency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Remount on each open so the form always starts from the item being edited.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {open ? (
          <FormBody item={item} defaultCurrency={defaultCurrency} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FormBody({
  item,
  defaultCurrency,
  onDone,
}: {
  item: CatalogItem | null;
  defaultCurrency: string;
  onDone: () => void;
}) {
  const t = useTranslations();
  const locale = resolveLocale(useLocale());
  const router = useRouter();
  const [values, setValues] = useState<CatalogFormValues>(() => {
    const currency = item?.currency ?? defaultCurrency;
    return {
      name: item?.name ?? "",
      description: item?.description ?? "",
      unit: item?.unit ?? "",
      unitPrice: item && isCurrencyCode(currency) ? formatMoneyInput(item.unitPriceMinor, currency, locale) : "",
      currency,
    };
  });
  const { pending, formError, errorFor, submit } = useServerForm<CatalogFormValues>((v) =>
    saveCatalogItemAction(item?.id ?? null, v),
  );

  const set = (name: keyof CatalogFormValues) => (value: string) => setValues((prev) => ({ ...prev, [name]: value }));
  const invalid = (name: string) => Boolean(errorFor(name)) || undefined;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!(await submit(values))) return;
    toast.success(t("common.saved"));
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{item ? t("catalog.editTitle") : t("catalog.new")}</DialogTitle>
        <DialogDescription>{t("catalog.newDescription")}</DialogDescription>
      </DialogHeader>

      <FormField label={t("catalog.name")} htmlFor="catalog-name" error={errorFor("name")}>
        <Input
          id="catalog-name"
          value={values.name}
          aria-invalid={invalid("name")}
          onChange={(e) => set("name")(e.target.value)}
        />
      </FormField>
      <FormField label={t("catalog.descriptionLabel")} htmlFor="catalog-description" error={errorFor("description")}>
        <Textarea
          id="catalog-description"
          rows={3}
          value={values.description}
          aria-invalid={invalid("description")}
          onChange={(e) => set("description")(e.target.value)}
        />
      </FormField>
      <FormField label={t("catalog.unit")} htmlFor="catalog-unit" error={errorFor("unit")}>
        <Input
          id="catalog-unit"
          value={values.unit}
          aria-invalid={invalid("unit")}
          onChange={(e) => set("unit")(e.target.value)}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("catalog.currency")} htmlFor="catalog-currency" error={errorFor("currency")}>
          <CurrencySelect id="catalog-currency" value={values.currency} onValueChange={set("currency")} />
        </FormField>
        <FormField label={t("catalog.unitPrice")} htmlFor="catalog-price" error={errorFor("unitPrice")}>
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted"
            >
              {values.currency}
            </span>
            <Input
              id="catalog-price"
              inputMode="decimal"
              autoComplete="off"
              value={values.unitPrice}
              aria-invalid={invalid("unitPrice")}
              onChange={(e) => set("unitPrice")(e.target.value)}
              className="pl-12 text-right tabular-nums"
            />
          </div>
        </FormField>
      </div>

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
