"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { InvoiceDocumentView } from "@/documents/invoice-document-view";
import { ScaledDocument } from "@/documents/scaled-document";
import type { InvoiceDocument } from "@/documents/types";
import { TEMPLATES, type Template } from "@/features/profile/schema";
import { cn } from "@/lib/utils";
import { EditorSection, type EditorSectionProps } from "./editor-section";

/** Accent colours offered as one-click presets. */
export const ACCENT_PRESETS = ["#163300", "#00A67E", "#0A2540", "#111111", "#E25950", "#F5A623"] as const;

const HEX_RE = /^#?[0-9A-Fa-f]{6}$/;

/**
 * One template option. Memoized: the three thumbnails are the costliest part of the form, so a card
 * re-renders only when its own selection state or the (deferred) document changes, never because
 * another field was typed into.
 */
export const TemplateCard = memo(function TemplateCard({
  template,
  index,
  doc,
  selected,
  onSelect,
  onKeyDown,
}: {
  template: Template;
  index: number;
  doc: InvoiceDocument;
  selected: boolean;
  onSelect: (template: Template) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
}) {
  const t = useTranslations("settings.templates");
  const templateDoc = useMemo(() => ({ ...doc, template }), [doc, template]);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={t(template)}
      tabIndex={selected ? 0 : -1}
      data-template-option={template}
      onClick={() => onSelect(template)}
      onKeyDown={(event) => onKeyDown(event, index)}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-card border bg-white p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        selected ? "border-accent ring-1 ring-accent" : "border-border hover:border-muted/60",
      )}
    >
      {/* A miniature of the real document in this template: same view, scaled down, not interactive. */}
      <span
        aria-hidden
        inert
        className="pointer-events-none block aspect-[210/297] w-full select-none overflow-hidden rounded-input border border-border bg-white"
      >
        <ScaledDocument>
          <InvoiceDocumentView doc={templateDoc} />
        </ScaledDocument>
      </span>
      <span className={cn("text-center text-xs font-medium", selected ? "text-accent" : "text-fg")}>{t(template)}</span>
    </button>
  );
});

/** Template picker (three live thumbnails) and accent colour (picker, hex field, presets). */
export function AppearanceSection({ state, update, doc }: EditorSectionProps & { doc: InvoiceDocument }) {
  const t = useTranslations("invoices.editor");
  // What is being typed in the hex field while it is not (yet) a colour; null = show the state's.
  const [draft, setDraft] = useState<string | null>(null);

  const hexShown = draft ?? state.accentColor;
  const hexInvalid = draft !== null && !HEX_RE.test(draft.trim());

  function onHexChange(value: string) {
    setDraft(value);
    const text = value.trim();
    if (HEX_RE.test(text)) update({ accentColor: text.startsWith("#") ? text : `#${text}` });
  }

  // `update` is a new function on every render of the editor; the cards get stable handlers that
  // always call the latest one.
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  });
  const selectTemplate = useCallback((template: Template) => updateRef.current({ template }), []);
  const onTemplateKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TEMPLATES[(index + step + TEMPLATES.length) % TEMPLATES.length];
    updateRef.current({ template: next });
    // Move focus with the selection (radio group behaviour).
    requestAnimationFrame(() =>
      document.querySelector<HTMLButtonElement>(`[data-template-option="${next}"]`)?.focus(),
    );
  }, []);

  return (
    <EditorSection title={t("sections.appearance")}>
      <div role="radiogroup" aria-label={t("appearance.template")} className="grid grid-cols-3 gap-2 sm:gap-3">
        {TEMPLATES.map((template, index) => (
          <TemplateCard
            key={template}
            template={template}
            index={index}
            doc={doc}
            selected={state.template === template}
            onSelect={selectTemplate}
            onKeyDown={onTemplateKeyDown}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="invoice-accent-hex" className="text-sm font-medium text-fg">
          {t("appearance.accent")}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="color"
            aria-label={t("appearance.picker")}
            value={state.accentColor.toLowerCase()}
            onChange={(event) => {
              setDraft(null);
              update({ accentColor: event.target.value });
            }}
            className="size-11 shrink-0 cursor-pointer rounded-full border border-border bg-white p-1"
          />
          <input
            id="invoice-accent-hex"
            value={hexShown}
            spellCheck={false}
            autoComplete="off"
            maxLength={7}
            aria-label={t("appearance.hex")}
            aria-invalid={hexInvalid || undefined}
            onChange={(event) => onHexChange(event.target.value)}
            onBlur={() => setDraft(null)}
            className={cn(
              "h-11 w-28 rounded-input border bg-white px-3 font-mono text-sm uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              hexInvalid ? "border-danger" : "border-border",
            )}
          />
          <div role="group" aria-label={t("appearance.presetLabel")} className="flex flex-wrap gap-1.5">
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
        </div>
        {hexInvalid ? <p className="text-xs text-danger">{t("appearance.invalidHex")}</p> : null}
      </div>
    </EditorSection>
  );
}
