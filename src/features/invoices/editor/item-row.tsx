"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BookmarkPlus, GripVertical, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isCurrencyCode } from "@/lib/currencies";
import { formatMoney } from "@/lib/money";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { applyCatalogItem, type CatalogOption, type EditorItem, type EditorItemEvaluation } from "../editor-state";
import { CatalogAutocomplete } from "./catalog-autocomplete";
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
 * can move focus to it, suggests catalog items while typing and the line can be saved to the
 * catalog. The grip on the left drags the line (sortable); the order is the `items` array.
 */
export function ItemRow({
  item,
  index,
  currency,
  locale,
  evaluation,
  errors,
  catalog,
  savingToCatalog,
  onChange,
  onRemove,
  onEnterPrice,
  onSaveToCatalog,
}: {
  item: EditorItem;
  index: number;
  currency: string;
  locale: Locale;
  evaluation: EditorItemEvaluation;
  errors: Record<string, string>;
  catalog: CatalogOption[];
  savingToCatalog: boolean;
  onChange: (patch: Partial<EditorItem>) => void;
  onRemove: () => void;
  onEnterPrice: () => void;
  onSaveToCatalog: () => void;
}) {
  const t = useTranslations("invoices.editor.items");
  const errorText = useErrorText(errors);
  const field = (name: string) => `items.${index}.${name}`;
  const id = (name: string) => `item-${item.key}-${name}`;
  const n = index + 1;
  // Set when a catalog item in another currency was picked: its price was not taken over.
  const [catalogCurrency, setCatalogCurrency] = useState<string | null>(null);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  });
  // Rows only move vertically.
  const style = { transform: CSS.Transform.toString(transform ? { ...transform, x: 0 } : null), transition };

  function pickCatalogItem(option: CatalogOption) {
    const { patch, priceCurrency } = applyCatalogItem(option, currency, locale);
    onChange(patch);
    setCatalogCurrency(priceCurrency);
  }

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
    <div
      ref={setNodeRef}
      style={style}
      role="group"
      aria-label={t("itemN", { n })}
      className={cn(
        "relative flex flex-col gap-2 bg-white py-3 first:pt-0 last:pb-0",
        isDragging && "z-20 rounded-md shadow-md ring-1 ring-border",
      )}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("dragHandle", { n })}
          className="inline-flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:cursor-grabbing disabled:cursor-default"
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <label htmlFor={id("name")} className="sr-only">
            {t("name")}
          </label>
          <CatalogAutocomplete
            id={id("name")}
            itemKey={item.key}
            value={item.name}
            placeholder={t("name")}
            invalid={Boolean(errors[field("name")])}
            catalog={catalog}
            onValueChange={(name) => {
              setCatalogCurrency(null);
              onChange({ name });
            }}
            onPick={pickCatalogItem}
          />
          {errors[field("name")] ? <p className="mt-1 text-xs text-danger">{errorText(field("name"))}</p> : null}
          {catalogCurrency ? (
            <p className="mt-1 text-xs text-muted">{t("catalogCurrencyHint", { currency: catalogCurrency })}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t("saveToCatalog")}
          title={t("saveToCatalog")}
          disabled={item.name.trim() === "" || savingToCatalog}
          onClick={onSaveToCatalog}
          className="size-9 shrink-0 px-0 text-muted hover:text-fg"
        >
          <BookmarkPlus className="size-4" />
        </Button>
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
            onChange={(event) => {
              setCatalogCurrency(null);
              onChange({ unitPrice: event.target.value });
            }}
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
