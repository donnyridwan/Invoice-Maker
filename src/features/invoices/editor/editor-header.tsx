"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AutosaveStatus } from "../autosave";
import type { DisplayStatus } from "../display-status";
import { StatusBadge } from "../status-badge";

function AutosaveIndicator({ status, onRetry }: { status: AutosaveStatus; onRetry: () => void }) {
  const t = useTranslations("invoices.editor.autosave");

  let content: ReactNode = null;
  if (status === "saving") {
    content = (
      <span title={t("saving")} className="inline-flex items-center gap-1.5 text-muted">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        <span className="sr-only whitespace-nowrap sm:not-sr-only xl:sr-only 2xl:not-sr-only">{t("saving")}</span>
      </span>
    );
  } else if (status === "saved") {
    content = (
      <span title={t("saved")} className="inline-flex items-center gap-1.5 text-muted">
        <Check className="size-3.5 text-badge-success-fg" aria-hidden />
        <span className="sr-only whitespace-nowrap sm:not-sr-only xl:sr-only 2xl:not-sr-only">{t("saved")}</span>
      </span>
    );
  } else if (status === "error") {
    content = (
      <button
        type="button"
        onClick={onRetry}
        title={t("error")}
        className="inline-flex items-center gap-1.5 rounded text-danger underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <AlertCircle className="size-3.5" aria-hidden />
        <span className="sr-only whitespace-nowrap sm:not-sr-only xl:sr-only 2xl:not-sr-only">{t("error")}</span>
      </button>
    );
  } else if (status === "invalid") {
    content = (
      <span title={t("invalid")} className="inline-flex items-center gap-1.5 text-badge-warning-fg">
        <AlertCircle className="size-3.5" aria-hidden />
        <span className="sr-only whitespace-nowrap sm:not-sr-only xl:sr-only 2xl:not-sr-only">{t("invalid")}</span>
      </span>
    );
  }

  // A polite live region that is always mounted, so changes are announced.
  return (
    <div role="status" aria-live="polite" className={cn("min-w-0 text-[13px]", status === "idle" && "min-h-5")}>
      {content}
    </div>
  );
}

// In the narrow form column of a wide screen the autosave state shows as an icon (with its text as
// a tooltip and for assistive technology); very wide screens and phones get the text too.

/**
 * The editor's top bar, over the form column: back to the list, the invoice number and its status,
 * the autosave indicator. `actions` is where the header buttons and the ⋯ menu go.
 */
export function EditorHeader({
  number,
  status,
  autosave,
  onRetry,
  actions,
}: {
  number: string;
  status: DisplayStatus;
  autosave: AutosaveStatus;
  onRetry: () => void;
  actions?: ReactNode;
}) {
  const t = useTranslations("invoices.editor");

  return (
    // Its content lines up with the form column.
    <header className="sticky top-14 z-20 shrink-0 border-b border-border bg-white md:top-0">
      <div className="mx-auto flex h-16 w-full max-w-[640px] items-center gap-2 px-4 md:px-8">
        <Link
          href="/invoices"
          aria-label={t("backToList")}
          className="-ml-2 inline-flex size-8 shrink-0 items-center justify-center text-muted transition-colors hover:bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="min-w-0 truncate font-serif text-lg text-fg">{number.trim() || "—"}</h1>
        <StatusBadge status={status} className="shrink-0" />
        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <AutosaveIndicator status={autosave} onRetry={onRetry} />
          {actions}
        </div>
      </div>
    </header>
  );
}
