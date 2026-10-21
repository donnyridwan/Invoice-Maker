"use client";

import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { EditorSection, useErrorText, type EditorSectionProps } from "./editor-section";

export function NotesSection({ state, errors, update }: EditorSectionProps) {
  const t = useTranslations("invoices.editor");
  const errorText = useErrorText(errors);

  return (
    <EditorSection title={t("sections.notes")}>
      <div>
        <Textarea
          id="invoice-notes"
          aria-label={t("notes.label")}
          value={state.notes}
          placeholder={t("notes.placeholder")}
          onChange={(event) => update({ notes: event.target.value })}
          aria-invalid={Boolean(errors.notes) || undefined}
        />
        {errorText("notes") ? <p className="mt-1.5 text-xs text-danger">{errorText("notes")}</p> : null}
      </div>
    </EditorSection>
  );
}
