import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Soft two-tone gradients, picked per name so a client keeps the same colour everywhere. */
const GRADIENTS = [
  "from-[#ff9a62] to-[#f5576c]",
  "from-[#7dd3fc] to-[#3b82f6]",
  "from-[#86efac] to-[#10b981]",
  "from-[#c4b5fd] to-[#8b5cf6]",
  "from-[#fcd34d] to-[#f59e0b]",
  "from-[#f9a8d4] to-[#ec4899]",
  "from-[#5eead4] to-[#0d9488]",
] as const;

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

/** A round gradient badge with someone's initials, for list rows and pickers. Decorative: the name is always shown next to it. */
function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      data-slot="avatar"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-semibold text-white",
        GRADIENTS[hash(name) % GRADIENTS.length],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** A small grey square holding an icon: the thumbnail of a row that has no picture of its own. */
function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      aria-hidden
      data-slot="icon-tile"
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-sidebar text-muted", className)}
    >
      <Icon className="size-4" />
    </span>
  );
}

export { Avatar, IconTile };
