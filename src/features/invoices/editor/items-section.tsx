"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveItemToCatalogAction } from "@/features/catalog/actions";
import type { Locale } from "@/i18n/config";
import { isCurrencyCode } from "@/lib/currencies";
import { cn } from "@/lib/utils";
import { translateValidation } from "@/lib/validation-message";
import {
  isBlankItem,
  newEditorItem,
  type CatalogOption,
  type EditorEvaluation,
  type EditorItem,
} from "../editor-state";
import { EditorSection, type EditorSectionProps } from "./editor-section";
import { ITEM_COLUMNS, ItemRow } from "./item-row";

const NO_EVALUATION = { quantityMilli: null, unitPriceMinor: null, amountMinor: null };

export function ItemsSection({
  state,
  errors,
  update,
  evaluation,
  locale,
  catalog,
}: EditorSectionProps & { evaluation: EditorEvaluation; locale: Locale; catalog: CatalogOption[] }) {
  const t = useTranslations("invoices.editor");
  const tAll = useTranslations();
  const dndId = useId();
  const [savingKey, setSavingKey] = useState<string | null>(null);
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

  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so a plain click on the grip does nothing.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    update((current) => {
      const from = current.items.findIndex((item) => item.key === active.id);
      const to = current.items.findIndex((item) => item.key === over.id);
      return from < 0 || to < 0 ? {} : { items: arrayMove(current.items, from, to) };
    });
  }

  const position = (id: string | number) => items.findIndex((item) => item.key === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => t("items.dnd.start", { n: position(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? t("items.dnd.over", { from: position(active.id), to: position(over.id) }) : undefined,
    onDragEnd: ({ active, over }) =>
      over ? t("items.dnd.end", { from: position(active.id), to: position(over.id) }) : undefined,
    onDragCancel: ({ active }) => t("items.dnd.cancel", { n: position(active.id) }),
  };

  async function saveToCatalog(index: number) {
    const item = items[index];
    const unitPriceMinor = evaluation.rows[index]?.unitPriceMinor ?? null;
    if (unitPriceMinor === null || !isCurrencyCode(state.currency)) {
      toast.error(tAll("validation.invalidAmount"));
      return;
    }
    setSavingKey(item.key);
    try {
      const result = await saveItemToCatalogAction({
        name: item.name,
        description: item.description,
        unit: item.unit,
        unitPriceMinor,
        currency: state.currency,
      });
      if (result.ok) toast.success(t("items.savedToCatalog"));
      else if (result.fieldErrors) {
        const first = Object.values(result.fieldErrors)[0]?.[0];
        toast.error(first ? translateValidation(tAll, first) : tAll("errors.validation"));
      } else toast.error(tAll(`errors.${result.error}`));
    } catch {
      toast.error(tAll("errors.unknown"));
    } finally {
      setSavingKey(null);
    }
  }

  /** Enter in a price field: next row's name, or a new row after the last (unless it is empty). */
  function onEnterPrice(index: number) {
    const next = items[index + 1];
    if (next) focusName(next.key);
    else if (!isBlankItem(items[index])) addItem();
  }

  return (
    // The step heading above already reads "Item"; the section title stays for assistive technology.
    <EditorSection title={t("sections.items")} hideTitle>
      <div>
        {/* Column headings (the inputs carry their own labels for assistive technology). */}
        <div aria-hidden className="hidden items-end gap-2 border-b border-border pb-2 text-xs text-muted sm:flex">
          <span className={ITEM_COLUMNS.grip} />
          <span className="flex-1">{t("items.name")}</span>
          <span className={cn("text-right", ITEM_COLUMNS.quantity)}>{t("items.quantity")}</span>
          <span className={cn("text-right", ITEM_COLUMNS.price)}>{t("items.unitPrice")}</span>
          <span className={cn("text-right", ITEM_COLUMNS.amount)}>{t("items.amount")}</span>
          <span className={ITEM_COLUMNS.actions} />
        </div>
        <div ref={containerRef} className="flex flex-col divide-y divide-border border-b border-border">
          {items.length === 0 ? <p className="py-3 text-sm text-muted">{t("items.empty")}</p> : null}
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            accessibility={{ announcements, screenReaderInstructions: { draggable: t("items.dnd.instructions") } }}
          >
            <SortableContext items={items.map((item) => item.key)} strategy={verticalListSortingStrategy}>
              {items.map((item, index) => (
                <ItemRow
                  key={item.key}
                  item={item}
                  index={index}
                  currency={state.currency}
                  locale={locale}
                  evaluation={evaluation.rows[index] ?? NO_EVALUATION}
                  errors={errors}
                  catalog={catalog}
                  savingToCatalog={savingKey === item.key}
                  onChange={(patch) => changeItem(item.key, patch)}
                  onRemove={() => removeItem(item.key)}
                  onEnterPrice={() => onEnterPrice(index)}
                  onSaveToCatalog={() => void saveToCatalog(index)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={addItem} className="mt-2 text-muted hover:text-fg">
          <Plus className="size-4" />
          {t("items.add")}
        </Button>
      </div>
    </EditorSection>
  );
}
