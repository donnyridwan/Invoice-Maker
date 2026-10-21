"use client";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type PaymentMethod = {
  title: string;
  lines: { key: string; label: string; value: string; copyable: boolean }[];
};

/** "Cara pembayaran": every payment account of the invoice, with copy buttons on the numbers. */
export function PaymentMethodsCard({ methods, business }: { methods: PaymentMethod[]; business: string }) {
  const t = useTranslations("public.methods");

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <Card role="region" aria-labelledby="payment-methods-title" className="p-5 sm:p-7">
      <h2 id="payment-methods-title" className="text-base font-semibold text-fg">
        {t("title")}
      </h2>
      {methods.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t("empty", { business })}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {methods.map((method, index) => (
            <li key={index} className="rounded-card bg-subtle">
              {method.title ? (
                <p className="border-b border-border bg-subtle px-4 py-2 text-sm font-medium text-fg">{method.title}</p>
              ) : null}
              <dl className="divide-y divide-border">
                {method.lines.map((line) => (
                  <div key={line.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <dt className="text-xs text-muted">{line.label}</dt>
                      <dd className="text-sm font-medium break-words whitespace-pre-line text-fg tabular-nums">
                        {line.value}
                      </dd>
                    </div>
                    {line.copyable ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        aria-label={t("copyLabel", { label: line.label })}
                        onClick={() => copy(line.value)}
                      >
                        <Copy className="size-3.5" aria-hidden />
                        {t("copy")}
                      </Button>
                    ) : null}
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
