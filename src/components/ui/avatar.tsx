import * as React from "react";
import { cn } from "@/lib/utils";

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

/** A small grey circle with someone's initials, for list rows and pickers. Decorative: the name is always shown next to it. */
function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      data-slot="avatar"
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-subtle text-[10px] font-medium uppercase text-muted",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export { Avatar };
