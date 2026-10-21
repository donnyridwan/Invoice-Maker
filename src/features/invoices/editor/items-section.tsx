"use client";

import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import { isBlankItem, newEditorItem, type EditorEvaluation, type EditorItem } from "../editor-state";
import { EditorSection, type EditorSectionProps } from "./editor-section";
import { ItemRow } from "./item-row";

const NO_EVALUATION = { quantityMilli: null, unitPriceMinor: null, amountMinor: null };

export function ItemsSection({
  state,
  errors,
  update,
  evaluation,
  locale,
}: EditorSectionProps & { evaluation: EditorEvaluation; locale: Locale }) {
  const t = useTranslations("invoices.editor");
  const containerRef = useRef<HTMLDivElement>(null);
  // Row added by the last action; its name field takes focus once the row has rendered.
  const pendingFocus = useRef<string | null>(null);
  const { items } = state;

  function focusName(key: string) {
    containerRef.current?.querySelector<HTMLInputElement>(`[data-item-name="${CSS.escape(key)}"]`)?.focus();
  }

  useEffect(() => {
    if (pendingFocus.current) {
      focusName(pendingFocus.current);
      pendingFocus.current = null;
    }
  }, [items]);

  function changeItem(key: string, patch: Partial<EditorItem>) {
    update((current) => ({ items: current.items.map((item) => (item.key === key ? { ...item, ...patch } : item)) }));
  }

  function addItem() {
    const item = newEditorItem();
    pendingFocus.current = item.key;
    update((current) => ({ items: [...current.items, item] }));
  }

  function removeItem(key: string) {
    update((current) => ({ items: current.items.filter((item) => item.key !== key) }));
  }

  /** Enter in a price field: next row's name, or a new row after the last (unless it is empty). */
  function onEnterPrice(index: number) {
    const next = items[index + 1];
    if (next) focusName(next.key);
    else if (!isBlankItem(items[index])) addItem();
  }

  return (
    <EditorSection title={t("sections.items")}>
      <div ref={containerRef} className="flex flex-col divide-y divide-border">
        {items.length === 0 ? <p className="pb-3 text-sm text-muted">{t("items.empty")}</p> : null}
        {items.map((item, index) => (
          <ItemRow
            key={item.key}
            item={item}
            index={index}
            currency={state.currency}
            locale={locale}
            evaluation={evaluation.rows[index] ?? NO_EVALUATION}
            errors={errors}
            onChange={(patch) => changeItem(item.key, patch)}
            onRemove={() => removeItem(item.key)}
            onEnterPrice={() => onEnterPrice(index)}
          />
        ))}
      </div>
      <div>
        <Button type="button" variant="secondary" size="sm" onClick={addItem}>
          <Plus className="size-4" />
          {t("items.add")}
        </Button>
      </div>
    </EditorSection>
  );
}
