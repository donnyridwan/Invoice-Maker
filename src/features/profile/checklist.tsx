import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ChecklistState = { profileComplete: boolean; hasPaymentAccount: boolean; hasSentInvoice: boolean };

/** "Get started" card on the dashboard: what is done and what still needs setting up. Gone once every step is done. */
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
    <Card role="region" aria-labelledby="checklist-title">
      <CardHeader>
        <CardTitle id="checklist-title">{t("title")}</CardTitle>
        <CardDescription>{t("progress", { done: doneCount, total: items.length })}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((item) => (
            <li key={item.key} data-done={item.done}>
              <Link href={item.href} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-subtle">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    item.done ? "border-accent bg-accent text-white" : "border-border bg-white",
                  )}
                >
                  {item.done ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
                <span className={cn("flex-1 font-medium", item.done ? "text-muted line-through" : "text-fg")}>
                  {item.label}
                </span>
                <span className="sr-only">{item.done ? t("done") : t("todo")}</span>
                <ChevronRight className="size-4 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
