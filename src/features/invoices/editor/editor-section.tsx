"use client";

import { useId, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { translateValidation } from "@/lib/validation-message";
import type { EditorErrors, EditorState } from "../editor-state";

/** What every form section receives: the state, the errors to show and a way to change it. */
export type EditorSectionProps = {
  state: EditorState;
  errors: EditorErrors;
  update: (change: Partial<EditorState> | ((state: EditorState) => Partial<EditorState>)) => void;
};

/** Looks up the translated message for an error key such as `number` or `items.0.unitPrice`. */
export function useErrorText(errors: EditorErrors): (key: string) => string | undefined {
  const t = useTranslations();
  return (key) => (errors[key] ? translateValidation(t, errors[key]) : undefined);
}

/**
 * A form section: a label-like title, then the fields. No frame or divider: the sections of a step
 * are set apart by space alone. `hideTitle` keeps the title for assistive technology only (where
 * the step heading or the fields' own labels already say it).
 */
export function EditorSection({
  title,
  action,
  hideTitle = false,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  hideTitle?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={className}>
      {hideTitle ? (
        <h3 id={headingId} className="sr-only">
          {title}
        </h3>
      ) : (
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <h3 id={headingId} className="text-[13px] font-normal text-[#606060]">
            {title}
          </h3>
          {action}
        </div>
      )}
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
