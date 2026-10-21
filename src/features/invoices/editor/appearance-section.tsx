"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { EditorSectionProps } from "./editor-section";

/** Accent colours offered as one-click presets. */
export const ACCENT_PRESETS = ["#2F4B73", "#0A2540", "#00A67E", "#111111", "#E25950", "#F5A623"] as const;

const SWATCH_CLASS =
  "size-7 shrink-0 rounded-full border border-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const SWATCH_SELECTED_CLASS = "ring-2 ring-offset-2 ring-fg";

/**
 * The accent colour, shown as a compact row of swatches above the live preview so the form stays
 * short; the last swatch opens the colour picker for any other colour. The template comes from the
 * profile's default (Settings).
 */
export function AppearanceBar({ state, update, disabled }: Omit<EditorSectionProps, "errors"> & { disabled?: boolean }) {
  const t = useTranslations("invoices.editor");
  const accent = state.accentColor.toUpperCase();
  const custom = !(ACCENT_PRESETS as readonly string[]).includes(accent);

  return (
    <fieldset
      disabled={disabled}
      aria-label={t("appearance.accent")}
      className="m-0 mb-3 flex min-w-0 flex-wrap items-center gap-3 rounded-card border border-border bg-white px-4 py-2.5 sm:mb-4"
    >
      <span aria-hidden className="text-sm font-semibold text-fg">
        {t("appearance.accent")}
      </span>
      <div role="group" aria-label={t("appearance.presetLabel")} className="flex flex-wrap items-center gap-2">
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
