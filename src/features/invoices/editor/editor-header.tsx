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
      <span className="inline-flex items-center gap-1.5 text-muted">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        {t("saving")}
      </span>
    );
  } else if (status === "saved") {
    content = (
      <span className="inline-flex items-center gap-1.5 text-muted">
        <Check className="size-3.5 text-badge-success-fg" aria-hidden />
        {t("saved")}
      </span>
    );
  } else if (status === "error") {
    content = (
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded text-danger underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <AlertCircle className="size-3.5" aria-hidden />
        {t("error")}
      </button>
    );
  } else if (status === "invalid") {
    content = (
      <span className="inline-flex items-center gap-1.5 text-badge-warning-fg">
        <AlertCircle className="size-3.5" aria-hidden />
        {t("invalid")}
      </span>
    );
  }

  // A polite live region that is always mounted, so changes are announced.
  return (
    <div role="status" aria-live="polite" className={cn("min-w-0 text-sm", status === "idle" && "min-h-5")}>
      {content}
    </div>
  );
}

/**
 * Sticky bar above the editor: back to the list, the invoice number, its status and the autosave
 * indicator. `actions` is where the header buttons and the ⋯ menu go.
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
    <header className="sticky top-14 z-20 -mx-4 flex h-14 items-center gap-3 border-b border-border bg-white px-4 md:top-0 md:-mx-6 md:px-6">
      <Link
        href="/invoices"
        aria-label={t("backToList")}
        className="-ml-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <ArrowLeft className="size-4" />
      </Link>
      <h1 className="min-w-0 truncate text-base font-semibold tracking-tight text-fg">{number.trim() || "—"}</h1>
      <StatusBadge status={status} className="shrink-0" />
      <div className="ml-auto flex min-w-0 items-center gap-3">
        <AutosaveIndicator status={autosave} onRetry={onRetry} />
        {actions}
      </div>
    </header>
  );
}
