"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { initials } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { switchWorkspaceAction } from "./actions";
import { NewWorkspaceDialog } from "./new-workspace-form";
import type { WorkspaceSummary } from "./queries";

function WorkspaceMark({ workspace, className }: { workspace: WorkspaceSummary; className?: string }) {
  return workspace.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={workspace.logoUrl}
      alt=""
      className={cn("size-8 shrink-0 border border-border bg-white object-contain", className)}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center border border-border bg-subtle text-[11px] font-medium text-fg",
        className,
      )}
    >
      {initials(workspace.name)}
    </span>
  );
}

/**
 * Which business the app shows: the active one, and a menu to switch to another or start a new one.
 * `compact` is the square on the desktop icon rail; otherwise a full-width row with the name.
 */
export function WorkspaceSwitcher({
  workspace,
  workspaces,
  compact = false,
}: {
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  compact?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  function select(id: string) {
    if (id === workspace.id) return;
    startTransition(async () => {
      const result = await switchWorkspaceAction(id);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      // The action revalidated every page, so they all read the newly active workspace.
      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("workspaces.switch", { name: workspace.name })}
          disabled={pending}
          className={cn(
            "focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60",
            compact
              ? "flex size-10 items-center justify-center hover:bg-subtle"
              : "flex w-full items-center gap-2.5 border border-border bg-white px-2.5 py-2 text-left hover:bg-subtle",
          )}
        >
          <WorkspaceMark workspace={workspace} />
          {compact ? null : (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-fg">{workspace.name}</span>
                <span className="block truncate text-xs text-muted">{t(`workspaces.roles.${workspace.role}`)}</span>
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted" />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side={compact ? "right" : "bottom"} className="w-64">
          <DropdownMenuLabel>{t("workspaces.label")}</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onSelect={() => select(w.id)}>
              <WorkspaceMark workspace={w} className="size-6 text-[10px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-fg">{w.name}</span>
                <span className="block truncate text-xs">{t(`workspaces.roles.${w.role}`)}</span>
              </span>
              {w.id === workspace.id ? (
                <Check aria-label={t("workspaces.active")} className="size-4 text-accent" />
              ) : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus className="size-4 text-muted" />
            {t("workspaces.new")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
