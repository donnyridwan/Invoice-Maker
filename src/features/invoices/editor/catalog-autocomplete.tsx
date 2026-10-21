"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { filterCatalogOptions, type CatalogOption } from "../editor-state";

/**
 * The item-name input of a line, with suggestions from the catalog (active items whose name
 * contains what was typed, at most 8). Arrow keys move, Enter picks, Escape closes; typing a name
 * that is not in the catalog just works. The input carries `data-item-name` for focus moves.
 */
export function CatalogAutocomplete({
  id,
  itemKey,
  value,
  placeholder,
  invalid,
  catalog,
  onValueChange,
  onPick,
}: {
  id: string;
  itemKey: string;
  value: string;
  placeholder: string;
  invalid: boolean;
  catalog: CatalogOption[];
  onValueChange: (value: string) => void;
  onPick: (option: CatalogOption) => void;
}) {
  const t = useTranslations("invoices.editor.items");
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const suggestions = useMemo(() => filterCatalogOptions(catalog, value), [catalog, value]);
  const expanded = open && suggestions.length > 0;
  const activeIndex = Math.min(active, Math.max(suggestions.length - 1, 0));
  const optionId = (option: CatalogOption) => `${listId}-${option.id}`;

  function pick(option: CatalogOption) {
    onPick(option);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      if (!expanded) {
        setOpen(true);
        setActive(0);
      } else {
        setActive(Math.min(activeIndex + 1, suggestions.length - 1));
      }
    } else if (event.key === "ArrowUp" && expanded) {
      event.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter" && expanded) {
      event.preventDefault();
      pick(suggestions[activeIndex]);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        data-item-name={itemKey}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={expanded ? optionId(suggestions[activeIndex]) : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onValueChange(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="font-medium"
      />
      {expanded ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("catalogSuggestions")}
          // Keep the input focused while an option is pressed, so it does not blur and close first.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-white p-1 text-sm shadow-md"
        >
          {suggestions.map((option, index) => (
            <li
              key={option.id}
              id={optionId(option)}
              role="option"
              aria-selected={index === activeIndex}
              onClick={() => pick(option)}
              onMouseMove={() => setActive(index)}
              className={cn("cursor-pointer rounded-sm px-2 py-1.5", index === activeIndex && "bg-subtle")}
            >
              <span className="block truncate font-medium text-fg">{option.name}</span>
              {option.description || option.unit ? (
                <span className="block truncate text-xs text-muted">
                  {[option.unit, option.description].filter(Boolean).join(" · ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
