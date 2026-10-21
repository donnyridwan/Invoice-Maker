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

/** A rounded card with a bold sentence-case title; corner radius and colours come from the page theme. */
export function EditorSection({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn("rounded-card border border-border bg-white", className)}>
      <div className="flex min-h-12 items-center justify-between gap-3 px-5 pt-4">
        <h2 id={headingId} className="text-base font-bold tracking-tight text-fg">
          {title}
        </h2>
        {action}
      </div>
      <div className="flex flex-col gap-4 p-5 pt-3">{children}</div>
    </section>
  );
}
