"use client";

import { useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { TEMPLATES, type Template } from "@/features/profile/schema";
import { cn } from "@/lib/utils";
import type { EditorSectionProps } from "./editor-section";

/** Accent colours offered as one-click presets. */
export const ACCENT_PRESETS = ["#2F4B73", "#0A2540", "#00A67E", "#111111", "#E25950", "#F5A623"] as const;

const HEX_RE = /^#?[0-9A-Fa-f]{6}$/;

/**
 * Template and accent colour, shown as a compact bar above the live preview so the form stays
 * short: a pill switch for the template (the preview below is the thumbnail) and a row of colour
 * swatches, a colour picker and a hex field for the accent.
 */
export function AppearanceBar({ state, update, disabled }: Omit<EditorSectionProps, "errors"> & { disabled?: boolean }) {
  const t = useTranslations("invoices.editor");
  const tTemplates = useTranslations("settings.templates");
  // What is being typed in the hex field while it is not (yet) a colour; null = show the state's.
  const [draft, setDraft] = useState<string | null>(null);

  const hexShown = draft ?? state.accentColor;
  const hexInvalid = draft !== null && !HEX_RE.test(draft.trim());

  function onHexChange(value: string) {
    setDraft(value);
    const text = value.trim();
    if (HEX_RE.test(text)) update({ accentColor: text.startsWith("#") ? text : `#${text}` });
  }

  function onTemplateKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TEMPLATES[(index + step + TEMPLATES.length) % TEMPLATES.length];
    update({ template: next });
    // Move focus with the selection (radio group behaviour).
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(`[data-template-option="${next}"]`)?.focus(),
    );
  }

  return (
    <fieldset
      disabled={disabled}
      aria-label={t("sections.appearance")}
      className="m-0 mb-3 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-border bg-white px-3 py-2.5 sm:mb-4"
    >
      <div role="radiogroup" aria-label={t("appearance.template")} className="flex gap-1 rounded-button bg-subtle p-1">
        {TEMPLATES.map((template: Template, index) => {
          const selected = state.template === template;
          return (
            <button
              key={template}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              data-template-option={template}
              onClick={() => update({ template })}
              onKeyDown={(event) => onTemplateKeyDown(event, index)}
              className={cn(
                "h-8 rounded-button px-3.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60",
                selected ? "bg-white text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {tTemplates(template)}
            </button>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div role="group" aria-label={t("appearance.presetLabel")} className="flex items-center gap-1.5">
          {ACCENT_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              aria-pressed={state.accentColor.toUpperCase() === color}
              onClick={() => {
                setDraft(null);
                update({ accentColor: color });
              }}
              style={{ backgroundColor: color }}
              className={cn(
                "size-6 rounded-full border border-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                state.accentColor.toUpperCase() === color && "ring-2 ring-offset-2 ring-fg",
              )}
            />
          ))}
        </div>
        <input
          type="color"
          aria-label={t("appearance.picker")}
          value={state.accentColor.toLowerCase()}
          onChange={(event) => {
            setDraft(null);
            update({ accentColor: event.target.value });
          }}
          className="size-8 shrink-0 cursor-pointer rounded-full border border-border bg-white p-0.5"
        />
        <input
          value={hexShown}
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          aria-label={t("appearance.hex")}
          aria-invalid={hexInvalid || undefined}
          aria-describedby={hexInvalid ? "invoice-accent-hex-error" : undefined}
          onChange={(event) => onHexChange(event.target.value)}
          onBlur={() => setDraft(null)}
          className={cn(
            "h-8 w-24 rounded-button border bg-white px-3 font-mono text-xs uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            hexInvalid ? "border-danger" : "border-border",
          )}
        />
      </div>
      {hexInvalid ? (
        <p id="invoice-accent-hex-error" className="w-full text-xs text-danger">
          {t("appearance.invalidHex")}
        </p>
      ) : null}
    </fieldset>
  );
}
