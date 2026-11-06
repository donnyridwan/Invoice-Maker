"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useServerForm } from "@/lib/use-server-form";
import { createWorkspaceAction } from "./actions";

/**
 * The business name field that creates a workspace and moves on to its onboarding (the action
 * revalidated every page, so they all pick up the new active workspace).
 */
export function NewWorkspaceForm({ onCancel, submitLabel }: { onCancel?: () => void; submitLabel: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [name, setName] = useState("");
  const { pending, formError, errorFor, submit } = useServerForm(async (value: string) => {
    const result = await createWorkspaceAction(value);
    if (result.ok) {
      router.replace(result.data.redirectTo);
      router.refresh();
    }
    return result;
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await submit(name);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormField
        label={t("workspaces.name")}
        htmlFor="workspace-name"
        error={errorFor("_form")}
        hint={t("workspaces.nameHint")}
      >
        <Input
          id="workspace-name"
          value={name}
          autoComplete="organization"
          aria-invalid={Boolean(errorFor("_form")) || undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function NewWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("workspaces.newTitle")}</DialogTitle>
          <DialogDescription>{t("workspaces.newDescription")}</DialogDescription>
        </DialogHeader>
        <NewWorkspaceForm onCancel={() => onOpenChange(false)} submitLabel={t("workspaces.create")} />
      </DialogContent>
    </Dialog>
  );
}
