import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
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
    <section aria-labelledby="checklist-title" className="border border-border">
      <div className="border-b border-border px-5 py-4">
        <h2 id="checklist-title" className="font-serif text-lg text-fg">
          {t("title")}
        </h2>
        <p className="text-[13px] text-muted">{t("progress", { done: doneCount, total: items.length })}</p>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.key} data-done={item.done}>
            <Link
              href={item.href}
              className="group flex items-center gap-3 px-5 py-3.5 text-sm hover:bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center border",
                  item.done ? "border-fg bg-fg text-white" : "border-[#c4c4c4] bg-white",
                )}
              >
                {item.done ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className={cn("flex-1", item.done ? "text-muted line-through" : "text-fg")}>{item.label}</span>
              <span className="sr-only">{item.done ? t("done") : t("todo")}</span>
              <ChevronRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
