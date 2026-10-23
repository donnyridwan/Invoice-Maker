"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addDays, formatDocDate, isIsoDate, todayInJakarta } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Language = "id" | "en";

/** A one-click choice under the calendar, such as "14 hari" for a due date. */
export type DatePreset = { label: string; date: string };

/** "2026-10" → "2026-10-01". */
function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function shiftMonth(month: string, by: number): string {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 10);
}

/** The same day of the month `by` months away, clamped to the month's last day. */
function shiftDay(date: string, by: number): string {
  const target = shiftMonth(firstOfMonth(date), by);
  const d = new Date(`${target}T00:00:00Z`);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.slice(0, 8)}${String(Math.min(Number(date.slice(8)), lastDay)).padStart(2, "0")}`;
}

/** Monday-first position of a date in its week (0 = Monday). */
function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** The six weeks shown for a month, starting on the Monday on or before its first day. */
function monthGrid(month: string): string[] {
  const start = addDays(month, -weekdayIndex(month));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function intlLocale(language: Language): string {
  return language === "id" ? "id-ID" : "en-US";
}

/** Monday-first short weekday names. 2024-01-01 was a Monday. */
function weekdayNames(language: Language): string[] {
  const format = new Intl.DateTimeFormat(intlLocale(language), { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, index) => format.format(new Date(Date.UTC(2024, 0, 1 + index))));
}

function monthTitle(month: string, language: Language): string {
  return new Intl.DateTimeFormat(intlLocale(language), { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}T00:00:00Z`),
  );
}

function Calendar({
  value,
  language,
  onSelect,
}: {
  value: string;
  language: Language;
  onSelect: (date: string) => void;
}) {
  const t = useTranslations("datePicker");
  const today = todayInJakarta();
  const [focused, setFocused] = useState(isIsoDate(value) ? value : today);
  const [month, setMonth] = useState(firstOfMonth(focused));
  const gridRef = useRef<HTMLTableElement>(null);
  // Set by the arrow keys, so the newly focused day takes focus once rendered (not on mouse moves).
  const moveFocus = useRef(true);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [focused, month]);

  function focusDay(date: string) {
    moveFocus.current = true;
    setFocused(date);
    if (firstOfMonth(date) !== month) setMonth(firstOfMonth(date));
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(date, -1),
      ArrowRight: () => addDays(date, 1),
      ArrowUp: () => addDays(date, -7),
      ArrowDown: () => addDays(date, 7),
      Home: () => addDays(date, -weekdayIndex(date)),
      End: () => addDays(date, 6 - weekdayIndex(date)),
      PageUp: () => shiftDay(date, -1),
      PageDown: () => shiftDay(date, 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    focusDay(move());
  }

  const days = monthGrid(month);
  const weekdays = weekdayNames(language);

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <p aria-live="polite" className="pl-1 text-[13px] font-medium capitalize text-fg">
          {monthTitle(month, language)}
        </p>
        <div className="flex">
          {(
            [
              [-1, t("previousMonth"), ChevronLeft],
              [1, t("nextMonth"), ChevronRight],
            ] as const
          ).map(([by, label, Icon]) => (
            <button
              key={by}
              type="button"
              aria-label={label}
              onClick={() => setMonth(shiftMonth(month, by))}
              className="inline-flex size-7 items-center justify-center text-muted hover:bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>
      <table ref={gridRef} role="grid" aria-label={monthTitle(month, language)} className="border-collapse">
        <thead>
          <tr>
            {weekdays.map((name) => (
              <th key={name} scope="col" className="size-9 text-[11px] font-normal text-muted">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, week) => (
            <tr key={week}>
              {days.slice(week * 7, week * 7 + 7).map((date) => {
                const selected = date === value;
                const outside = firstOfMonth(date) !== month;
                return (
                  <td key={date} role="gridcell" aria-selected={selected} className="p-0">
                    <button
                      type="button"
                      data-date={date}
                      tabIndex={date === focused ? 0 : -1}
                      aria-label={formatDocDate(date, language)}
                      aria-current={date === today ? "date" : undefined}
                      onClick={() => onSelect(date)}
                      onKeyDown={(event) => onKeyDown(event, date)}
                      onFocus={() => setFocused(date)}
                      className={cn(
                        "flex size-9 items-center justify-center text-[13px] tabular-nums transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                        selected
                          ? "bg-fg text-white"
                          : cn("hover:bg-subtle", outside ? "text-muted/60" : "text-fg", date === today && "border border-border"),
                      )}
                    >
                      {Number(date.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * A date field: a button showing the date that opens a calendar, with optional presets under it
 * (picking one sets the date and closes, like picking a day). The value is an ISO date
 * (YYYY-MM-DD), also on the trigger as `data-value`. `suffix` is a short note after the date,
 * such as the payment term.
 */
export function DatePicker({
  id,
  value,
  onChange,
  language,
  presets,
  presetsLabel,
  suffix,
  disabled,
  invalid,
  className,
}: {
  id: string;
  value: string;
  onChange: (date: string) => void;
  language: Language;
  presets?: DatePreset[];
  presetsLabel?: string;
  suffix?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const t = useTranslations("datePicker");
  const [open, setOpen] = useState(false);

  function select(date: string) {
    onChange(date);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          data-value={value}
          data-invalid={invalid || undefined}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-input border border-border bg-white px-3 text-left text-sm text-fg focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30 disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-60 data-[invalid]:border-danger data-[state=open]:border-muted",
            className,
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {isIsoDate(value) ? formatDocDate(value, language) : <span className="text-muted">{t("placeholder")}</span>}
            {suffix ? <span className="text-muted"> · {suffix}</span> : null}
          </span>
          <CalendarDays aria-hidden className="size-4 shrink-0 text-muted" />
        </button>
      </PopoverTrigger>
      {/* The calendar focuses the chosen day itself, instead of the first button. */}
      <PopoverContent className="w-auto" onOpenAutoFocus={(event) => event.preventDefault()}>
        {/* Keyed by the value, so the calendar opens on the chosen month each time. */}
        <Calendar key={value} value={value} language={language} onSelect={select} />
        {presets && presets.length > 0 ? (
          <div
            role="group"
            aria-label={presetsLabel}
            className="flex divide-x divide-border border-t border-border"
          >
            {presets.map((preset) => {
              const active = preset.date === value;
              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => select(preset.date)}
                  className={cn(
                    "h-9 flex-1 whitespace-nowrap px-2 text-xs transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                    active ? "bg-fg text-white" : "bg-white text-muted hover:bg-subtle hover:text-fg",
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
