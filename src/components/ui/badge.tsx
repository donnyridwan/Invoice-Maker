import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-badge-neutral-bg text-badge-neutral-fg",
        info: "bg-badge-info-bg text-badge-info-fg",
        success: "bg-badge-success-bg text-badge-success-fg",
        warning: "bg-badge-warning-bg text-badge-warning-fg",
        danger: "bg-badge-danger-bg text-badge-danger-fg",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
