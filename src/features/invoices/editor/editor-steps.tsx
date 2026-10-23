"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { EditorErrors } from "../editor-state";

/** The editor's steps, in order: who and when, what, how to pay. */
export const EDITOR_STEPS = ["details", "items", "payment"] as const;
export type EditorStep = (typeof EDITOR_STEPS)[number];

export function isEditorStep(value: string): value is EditorStep {
  return (EDITOR_STEPS as readonly string[]).includes(value);
}

/** The step holding the field behind an error key such as `number` or `items.0.unitPrice`. */
export function stepOfError(key: string): EditorStep | null {
  if (key === "_form") return null;
  if (key.startsWith("items") || key.startsWith("discount")) return "items";
  if (key === "paymentAccountIds" || key === "notes") return "payment";
  return "details";
}

/** The steps with at least one field to fix. */
export function stepsWithErrors(errors: EditorErrors): Set<EditorStep> {
  const steps = new Set<EditorStep>();
  for (const key of Object.keys(errors)) {
    const step = stepOfError(key);
    if (step) steps.add(step);
  }
  return steps;
}

/**
 * The step bar at the top of the form. Every step can be opened at any time — the steps only split
 * the form, they never lock a part of it — and a step with a field to fix carries a red dot.
 */
export function EditorStepper({
  current,
  errors,
  onSelect,
}: {
  current: EditorStep;
  errors: Set<EditorStep>;
  onSelect: (step: EditorStep) => void;
}) {
  const t = useTranslations("invoices.editor.steps");
  const currentIndex = EDITOR_STEPS.indexOf(current);

  return (
    <nav aria-label={t("label")} className="border-b border-border bg-white xl:sticky xl:top-0 xl:z-10">
      <ol className="mx-auto flex w-full max-w-[640px] px-4 md:px-8">
        {EDITOR_STEPS.map((step, index) => {
          const active = step === current;
          const done = index < currentIndex;
          const invalid = errors.has(step);
          return (
            <li key={step} className="flex min-w-0 flex-1">
              <button
                type="button"
                aria-current={active ? "step" : undefined}
                onClick={() => onSelect(step)}
                className={cn(
                  "-mb-px flex h-12 min-w-0 flex-1 items-center gap-2 border-b-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                  active ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center border text-[11px] tabular-nums",
                    active ? "border-fg bg-fg text-white" : done ? "border-fg text-fg" : "border-border",
                  )}
                >
                  {done ? <Check className="size-3" /> : index + 1}
                </span>
                <span className="truncate">{t(step)}</span>
                {invalid ? (
                  <>
                    <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-danger" />
                    <span className="sr-only">{t("hasErrors")}</span>
                  </>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
