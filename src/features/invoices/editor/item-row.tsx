"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isCurrencyCode } from "@/lib/currencies";
import { formatMoney } from "@/lib/money";
import type { Locale } from "@/i18n/config";
import type { EditorItem, EditorItemEvaluation } from "../editor-state";
import { useErrorText } from "./editor-section";

function MiniField({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

/**
 * One invoice line: name, optional description, quantity, unit, price and the (read-only) amount.
 * Enter in the price field moves on to the next line (adding one after the last), so a list of
 * items can be typed without the mouse. The name input carries `data-item-name` so the section
 * can move focus to it.
 */
export function ItemRow({
  item,
  index,
  currency,
  locale,
  evaluation,
  errors,
  onChange,
  onRemove,
  onEnterPrice,
}: {
  item: EditorItem;
  index: number;
  currency: string;
  locale: Locale;
  evaluation: EditorItemEvaluation;
  errors: Record<string, string>;
  onChange: (patch: Partial<EditorItem>) => void;
  onRemove: () => void;
  onEnterPrice: () => void;
}) {
  const t = useTranslations("invoices.editor.items");
  const errorText = useErrorText(errors);
  const field = (name: string) => `items.${index}.${name}`;
  const id = (name: string) => `item-${item.key}-${name}`;
  const n = index + 1;

  function onPriceKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onEnterPrice();
  }

  const amount =
    evaluation.amountMinor !== null && isCurrencyCode(currency)
      ? formatMoney(evaluation.amountMinor, currency, locale)
      : "—";

  return (
    <div role="group" aria-label={t("itemN", { n })} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={id("name")} className="sr-only">
            {t("name")}
          </label>
          <Input
            id={id("name")}
            data-item-name={item.key}
            value={item.name}
            placeholder={t("name")}
            autoComplete="off"
            onChange={(event) => onChange({ name: event.target.value })}
            aria-invalid={Boolean(errors[field("name")]) || undefined}
            className="font-medium"
          />
          {errors[field("name")] ? <p className="mt-1 text-xs text-danger">{errorText(field("name"))}</p> : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("remove", { n })}
          onClick={onRemove}
          className="size-9 shrink-0 px-0 text-muted hover:text-danger"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div>
        <label htmlFor={id("description")} className="sr-only">
          {t("description")}
        </label>
        <Textarea
          id={id("description")}
          rows={1}
          value={item.description}
          placeholder={t("descriptionPlaceholder")}
          onChange={(event) => onChange({ description: event.target.value })}
          aria-invalid={Boolean(errors[field("description")]) || undefined}
          className="field-sizing-content min-h-9 resize-none py-1.5 text-sm"
        />
        {errors[field("description")] ? (
          <p className="mt-1 text-xs text-danger">{errorText(field("description"))}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[4.5rem_5.5rem_minmax(0,1fr)_minmax(0,1fr)]">
        <MiniField label={t("quantity")} htmlFor={id("quantity")} error={errorText(field("quantity"))}>
          <Input
            id={id("quantity")}
            inputMode="decimal"
            value={item.quantity}
            onChange={(event) => onChange({ quantity: event.target.value })}
            aria-invalid={Boolean(errors[field("quantity")]) || undefined}
            className="text-right tabular-nums"
          />
        </MiniField>
        <MiniField label={t("unit")} htmlFor={id("unit")} error={errorText(field("unit"))}>
          <Input
            id={id("unit")}
            value={item.unit}
            autoComplete="off"
            onChange={(event) => onChange({ unit: event.target.value })}
            aria-invalid={Boolean(errors[field("unit")]) || undefined}
          />
        </MiniField>
        <MiniField label={t("unitPrice")} htmlFor={id("unitPrice")} error={errorText(field("unitPrice"))}>
          <Input
            id={id("unitPrice")}
            inputMode="decimal"
            value={item.unitPrice}
            onChange={(event) => onChange({ unitPrice: event.target.value })}
            onKeyDown={onPriceKeyDown}
            aria-invalid={Boolean(errors[field("unitPrice")]) || undefined}
            className="text-right tabular-nums"
          />
        </MiniField>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted">{t("amount")}</span>
          <output
            aria-label={t("amount")}
            className="flex h-9 items-center justify-end truncate text-sm font-medium tabular-nums text-fg"
          >
            {amount}
          </output>
        </div>
      </div>
    </div>
  );
}
