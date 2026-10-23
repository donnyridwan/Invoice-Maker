import Link from "next/link";
import { Check, ChevronRight, Circle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

type ChecklistState = { profileComplete: boolean; hasPaymentAccount: boolean; hasSentInvoice: boolean };

/** "Get started" list on the dashboard: what is done and what still needs setting up. Gone once every step is done. */
export async function Checklist({ state }: { state: ChecklistState }) {
  const t = await getTranslations("dashboard.checklist");
  const items = [
    { key: "profile", done: state.profileComplete, href: "/settings", label: t("profile") },
    { key: "paymentAccount", done: state.hasPaymentAccount, href: "/settings/payment-accounts", label: t("paymentAccount") },
    { key: "sendInvoice", done: state.hasSentInvoice, href: "/invoices", label: t("sendInvoice") },
  ];
  const doneCount = items.filter((item) => item.done).length;
  if (doneCount === items.length) return null;

  return (
    <section aria-labelledby="checklist-title">
      <div className="mb-3">
        <h2 id="checklist-title" className="text-base font-semibold tracking-tight text-fg">
          {t("title")}
        </h2>
        <p className="text-[13px] text-muted">{t("progress", { done: doneCount, total: items.length })}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.key} data-done={item.done}>
            <Link
              href={item.href}
              className="group flex items-center gap-3 rounded-card p-1.5 pr-3 text-sm hover:bg-subtle focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-lg",
                  item.done ? "bg-fg text-white" : "bg-tile text-muted",
                )}
              >
                {item.done ? <Check className="size-4" strokeWidth={3} /> : <Circle className="size-4" />}
              </span>
              <span className={cn("flex-1 font-medium", item.done ? "text-muted line-through" : "text-fg")}>
                {item.label}
              </span>
              <span className="sr-only">{item.done ? t("done") : t("todo")}</span>
              <ChevronRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
