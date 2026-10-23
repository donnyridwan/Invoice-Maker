"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TEMPLATES, type Template } from "@/features/profile/schema";
import { cn } from "@/lib/utils";
import type { EditorSectionProps } from "./editor-section";

/** Accent colours offered as one-click presets. */
export const ACCENT_PRESETS = ["#111111", "#2F4B73", "#0A2540", "#00A67E", "#E25950", "#F5A623"] as const;

const SWATCH_CLASS =
  "size-6 shrink-0 rounded-full border border-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const SWATCH_SELECTED_CLASS = "ring-2 ring-offset-2 ring-fg";

/**
 * The floating bar over the preview, so the form stays short: a template dropdown (new invoices
 * start with the profile's default) and the accent colour as a row of swatches, the last of which
 * opens the colour picker for any other colour.
 */
export function AppearanceBar({
  state,
  update,
  disabled,
  className,
}: Omit<EditorSectionProps, "errors"> & { disabled?: boolean; className?: string }) {
  const t = useTranslations("invoices.editor");
  const tTemplates = useTranslations("settings.templates");
  const accent = state.accentColor.toUpperCase();
  const custom = !(ACCENT_PRESETS as readonly string[]).includes(accent);

  return (
    <fieldset
      disabled={disabled}
      aria-label={t("sections.appearance")}
      className={cn(
        "m-0 flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-2 border border-solid border-border bg-white px-2 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.08)]",
        className,
      )}
    >
      <div className="flex items-center">
        <label htmlFor="invoice-template" className="sr-only">
          {t("appearance.template")}
        </label>
        <Select value={state.template} onValueChange={(value) => update({ template: value as Template })} disabled={disabled}>
          <SelectTrigger id="invoice-template" className="h-8 w-32 text-[13px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TEMPLATES.map((template) => (
              <SelectItem key={template} value={template}>
                {tTemplates(template)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
      <div role="group" aria-label={t("appearance.presetLabel")} className="flex flex-wrap items-center gap-2 pr-1">
        {ACCENT_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={color}
            aria-pressed={accent === color}
            onClick={() => update({ accentColor: color })}
            style={{ backgroundColor: color }}
            className={cn(SWATCH_CLASS, accent === color && SWATCH_SELECTED_CLASS)}
          />
        ))}
        {/* The last swatch picks any colour: a rainbow until a custom colour is chosen, then that colour. */}
        <span
          style={{ background: custom ? accent : "conic-gradient(#e25950, #f5a623, #f8e71c, #00a67e, #4a90e2, #9013fe, #e25950)" }}
          className={cn("relative", SWATCH_CLASS, custom && SWATCH_SELECTED_CLASS, "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent")}
        >
          <input
            type="color"
            aria-label={t("appearance.picker")}
            value={state.accentColor.toLowerCase()}
            onChange={(event) => update({ accentColor: event.target.value })}
            className="absolute inset-0 size-full cursor-pointer rounded-full opacity-0 disabled:cursor-not-allowed"
          />
        </span>
      </div>
    </fieldset>
  );
}
