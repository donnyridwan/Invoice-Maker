import {
  CheckCircle2,
  CircleAlert,
  Copy,
  Eye,
  FilePlus2,
  Link2,
  Mail,
  MessageCircle,
  Pencil,
  RefreshCw,
  Send,
  Undo2,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { resolveLocale } from "@/i18n/config";
import { formatDocDate } from "@/lib/dates";
import { formatRelativeTime, formatWibDateTime } from "@/lib/relative-time";
import type { InvoiceEvent } from "../events";

const ICONS: Record<string, LucideIcon> = {
  created: FilePlus2,
  edited_after_send: Pencil,
  sent: Send,
  sent_email: Mail,
  shared_whatsapp: MessageCircle,
  link_copied: Link2,
  viewed: Eye,
  payment_claimed: Wallet,
  claim_rejected: XCircle,
  marked_paid: CheckCircle2,
  unmarked_paid: Undo2,
  voided: XCircle,
  duplicated: Copy,
  recurring_generated: RefreshCw,
  email_failed: CircleAlert,
};

const KNOWN_EVENTS = new Set(Object.keys(ICONS));
const SENT_CHANNELS = new Set(["manual", "link", "whatsapp", "email"]);

function metaString(meta: Record<string, unknown>, key: string): string | null {
  const value = meta[key];
  return typeof value === "string" && value ? value : null;
}

/**
 * The invoice's activity, newest first: an icon, the translated event (with the channel of a send,
 * the payer of a claim and the payment date where known) and the time relative to `now`, in WIB.
 * `payerNames` maps claim ids to the name the client gave.
 */
export function Timeline({
  events,
  payerNames,
  now,
}: {
  events: InvoiceEvent[];
  payerNames: Record<string, string>;
  now: Date;
}) {
  const t = useTranslations("invoices.detail.activity");
  const locale = resolveLocale(useLocale());

  if (events.length === 0) return <p className="text-sm text-muted">{t("empty")}</p>;

  function label(event: InvoiceEvent): { text: string; detail: string | null } {
    const meta = event.meta ?? {};
    const claimId = metaString(meta, "claimId");
    const paidOn = metaString(meta, "paidOn");
    const detail = paidOn && event.type === "marked_paid" ? t("paidOnDetail", { date: formatDocDate(paidOn, locale) }) : null;

    switch (event.type) {
      case "sent": {
        const channel = metaString(meta, "channel") ?? "";
        return { text: t(`events.sent.${SENT_CHANNELS.has(channel) ? channel : "other"}`), detail: null };
      }
      case "payment_claimed": {
        const name = claimId ? payerNames[claimId] : undefined;
        return { text: name ? t("events.payment_claimed", { name }) : t("events.payment_claimed_anonymous"), detail: null };
      }
      case "marked_paid":
        return { text: t(claimId ? "events.marked_paid_claim" : "events.marked_paid"), detail };
      default:
        return { text: t(KNOWN_EVENTS.has(event.type) ? `events.${event.type}` : "events.unknown"), detail: null };
    }
  }

  return (
    <ol className="flex flex-col">
      {events.map((event, index) => {
        const Icon = ICONS[event.type] ?? CircleAlert;
        const { text, detail } = label(event);
        const last = index === events.length - 1;
        return (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {last ? null : <span aria-hidden className="absolute left-[11px] top-6 -bottom-0 w-px bg-border" />}
            <span className="relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-subtle text-muted">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-fg">{text}</p>
              {detail ? <p className="text-xs text-muted">{detail}</p> : null}
              <time
                dateTime={event.createdAt.toISOString()}
                title={formatWibDateTime(event.createdAt, locale)}
                className="text-xs text-muted"
              >
                {formatRelativeTime(event.createdAt, now, locale)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
