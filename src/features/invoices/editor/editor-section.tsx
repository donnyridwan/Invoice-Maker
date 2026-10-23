"use client";

import { useId, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { translateValidation } from "@/lib/validation-message";
import { cn } from "@/lib/utils";
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
 * A flat form section: a small label-like title, then the fields; sections are divided by a
 * hairline. `hideTitle` keeps the title for assistive technology only (the totals, which read as
 * the end of the items).
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
    <section aria-labelledby={headingId} className={cn("border-t border-border py-6 first:border-t-0 first:pt-0", className)}>
      {hideTitle ? (
        <h2 id={headingId} className="sr-only">
          {title}
        </h2>
      ) : (
        <div className="mb-4 flex min-h-6 items-center justify-between gap-3">
          <h2 id={headingId} className="text-[13px] font-medium text-fg">
            {title}
          </h2>
          {action}
        </div>
      )}
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
