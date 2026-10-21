import type { ReactNode } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export type StatusBannerProps = {
  logoUrl?: string;
  badge: { label: string; variant: NonNullable<BadgeProps["variant"]> };
  title: string;
  /** "Jatuh tempo 5 November 2026 · 5 hari lagi" */
  subtitle: string | null;
  /** Extra line under the subtitle, e.g. "your payment is being confirmed". */
  note: string | null;
  /** Buttons (the "I've paid" dialog). */
  actions?: ReactNode;
};

/** The header card of the public page: who asks for how much, when, and the status. */
export function StatusBanner({ logoUrl, badge, title, subtitle, note, actions }: StatusBannerProps) {
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-7">
      <div className="flex items-start justify-between gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-11 rounded-full border border-border object-contain" />
        ) : (
          <span />
        )}
        <Badge variant={badge.variant} className="px-2.5 py-1">
          {badge.label}
        </Badge>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl leading-tight font-extrabold tracking-tight text-fg sm:text-3xl">{title}</h1>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </div>
      {note ? (
        <p className="rounded-card bg-subtle px-4 py-3 text-sm text-fg">{note}</p>
      ) : null}
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </Card>
  );
}
