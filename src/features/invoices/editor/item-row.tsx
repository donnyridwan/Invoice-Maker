"use client";

import { useState, type KeyboardEvent } from "react";
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

/** Column widths shared by the rows and the header of the items table (from sm up). */
export const ITEM_COLUMNS = {
  grip: "w-5",
  quantity: "sm:w-[4.5rem]",
  price: "sm:w-32",
  amount: "sm:w-28",
  actions: "w-[4.25rem]",
} as const;

/**
 * One invoice line, laid out as a table row: name, quantity, price and the (read-only) amount on
 * the first line, the optional description and unit under the name. On a phone the figures wrap
 * onto their own line.
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

  const errorFor = (name: string) =>
    errors[field(name)] ? <p className="mt-1 text-xs text-danger">{errorText(field(name))}</p> : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="group"
      aria-label={t("itemN", { n })}
      className={cn(
        "relative flex flex-col gap-2 bg-white py-3",
        isDragging && "z-20 shadow-md ring-1 ring-border",
      )}
    >
      <div className="flex flex-wrap items-start gap-x-2 gap-y-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("dragHandle", { n })}
          className={cn(
            ITEM_COLUMNS.grip,
            "inline-flex h-9 shrink-0 cursor-grab touch-none items-center justify-center text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:cursor-grabbing disabled:cursor-default",
          )}
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
          {errorFor("name")}
          {catalogCurrency ? (
            <p className="mt-1 text-xs text-muted">{t("catalogCurrencyHint", { currency: catalogCurrency })}</p>
          ) : null}
        </div>

        {/* The figures: beside the name from sm up, on their own line on a phone. */}
        <div className="order-last flex w-full items-start gap-2 pl-7 sm:order-none sm:w-auto sm:pl-0">
          <div className={cn("w-20 shrink-0", ITEM_COLUMNS.quantity)}>
            <label htmlFor={id("quantity")} className="sr-only">
              {t("quantity")}
            </label>
            <Input
              id={id("quantity")}
              inputMode="decimal"
              value={item.quantity}
              placeholder={t("quantity")}
              onChange={(event) => onChange({ quantity: event.target.value })}
              aria-invalid={Boolean(errors[field("quantity")]) || undefined}
              className="text-right tabular-nums"
            />
            {errorFor("quantity")}
          </div>
          <div className={cn("min-w-0 flex-1 sm:flex-none", ITEM_COLUMNS.price)}>
            <label htmlFor={id("unitPrice")} className="sr-only">
              {t("unitPrice")}
            </label>
            <Input
              id={id("unitPrice")}
              inputMode="decimal"
              value={item.unitPrice}
              placeholder={t("unitPrice")}
              onChange={(event) => {
                setCatalogCurrency(null);
                onChange({ unitPrice: event.target.value });
              }}
              onKeyDown={onPriceKeyDown}
              aria-invalid={Boolean(errors[field("unitPrice")]) || undefined}
              className="text-right tabular-nums"
            />
            {errorFor("unitPrice")}
          </div>
          <output
            aria-label={t("amount")}
            className={cn(
              "flex h-9 w-28 shrink-0 items-center justify-end truncate text-sm font-medium tabular-nums text-fg",
              ITEM_COLUMNS.amount,
            )}
          >
            {amount}
          </output>
        </div>

        <div className={cn("flex shrink-0 justify-end", ITEM_COLUMNS.actions)}>
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
      </div>

      {/* Second line, under the name: the optional description and unit. */}
      <div className="flex items-start gap-2 pl-7 sm:pr-[4.75rem]">
        <div className="min-w-0 flex-1">
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
            className="field-sizing-content min-h-8 resize-none py-1.5 text-[13px]"
          />
          {errorFor("description")}
        </div>
        <div className="w-24 shrink-0">
          <label htmlFor={id("unit")} className="sr-only">
            {t("unit")}
          </label>
          <Input
            id={id("unit")}
            value={item.unit}
            autoComplete="off"
            placeholder={t("unit")}
            onChange={(event) => onChange({ unit: event.target.value })}
            aria-invalid={Boolean(errors[field("unit")]) || undefined}
            className="h-8 text-[13px]"
          />
          {errorFor("unit")}
        </div>
      </div>
    </div>
  );
}
