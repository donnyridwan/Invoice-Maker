import { useTranslations } from "next-intl";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { Invoice } from "./queries";

type Status = Invoice["status"];

const STATUS_BADGES: Record<Status, { variant: NonNullable<BadgeProps["variant"]>; labelKey: string }> = {
  draft: { variant: "neutral", labelKey: "draft" },
  sent: { variant: "info", labelKey: "sent" },
  payment_claimed: { variant: "warning", labelKey: "paymentClaimed" },
  paid: { variant: "success", labelKey: "paid" },
  void: { variant: "neutral", labelKey: "void" },
};

/** Pastel status pill. Plan 3 adds derived labels (overdue, viewed) on top of the stored status. */
export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const t = useTranslations("invoices.status");
  const { variant, labelKey } = STATUS_BADGES[status];
  return (
    <Badge variant={variant} className={className}>
      {t(labelKey)}
    </Badge>
  );
}
