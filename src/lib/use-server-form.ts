"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { settleAction, type ActionResult } from "@/lib/action-result";
import { translateValidation } from "@/lib/validation-message";

/**
 * Submit state for a form backed by a server action: pending flag, per-field messages
 * (already translated) and a form-level error for non-validation failures.
 */
export function useServerForm<T>(action: (values: T) => Promise<ActionResult<unknown>>) {
  const t = useTranslations();
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(values: T): Promise<boolean> {
    setPending(true);
    setFormError(null);
    setFieldErrors({});
    // A thrown action (network error, body over the size limit) must not leave the form stuck.
    const result = await settleAction(() => action(values)).finally(() => setPending(false));
    if (result.ok) return true;
    setFieldErrors(result.fieldErrors ?? {});
    setFormError(result.fieldErrors ? null : t(`errors.${result.error}`));
    return false;
  }

  const errorFor = (name: string): string | undefined => {
    const message = fieldErrors[name]?.[0];
    return message ? translateValidation(t, message) : undefined;
  };

  return { pending, formError, errorFor, submit };
}
