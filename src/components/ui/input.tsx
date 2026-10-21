import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full rounded-input border border-border bg-white px-3 text-sm text-fg placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30 disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-60 aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
