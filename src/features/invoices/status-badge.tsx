import { useTranslations } from "next-intl";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { DisplayStatus } from "./display-status";

const STATUS_BADGES: Record<DisplayStatus, { variant: NonNullable<BadgeProps["variant"]>; labelKey: string }> = {
  draft: { variant: "neutral", labelKey: "draft" },
  sent: { variant: "info", labelKey: "sent" },
  viewed: { variant: "info", labelKey: "viewed" },
  awaiting_confirmation: { variant: "warning", labelKey: "awaitingConfirmation" },
  overdue: { variant: "danger", labelKey: "overdue" },
  paid: { variant: "success", labelKey: "paid" },
  void: { variant: "neutral", labelKey: "void" },
};

/** Pastel status pill for the derived status (stored status refined by views and the due date). */
export function StatusBadge({ status, className }: { status: DisplayStatus; className?: string }) {
  const t = useTranslations("invoices.status");
  const { variant, labelKey } = STATUS_BADGES[status];
  return (
    <Badge variant={variant} className={className}>
      {t(labelKey)}
    </Badge>
  );
}
