"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { AccountOption } from "../editor-state";
import { MAX_PAYMENT_ACCOUNTS } from "../schema";
import { EditorSection, useErrorText, type EditorSectionProps } from "./editor-section";

export function PaymentSection({
  accounts,
  state,
  errors,
  update,
}: EditorSectionProps & { accounts: AccountOption[] }) {
  const t = useTranslations("invoices.editor");
  const errorText = useErrorText(errors);
  const selected = new Set(state.paymentAccountIds);
  const atLimit = selected.size >= MAX_PAYMENT_ACCOUNTS;

  function toggle(id: string, checked: boolean) {
    update((current) => ({
      paymentAccountIds: checked
        ? current.paymentAccountIds.includes(id)
          ? current.paymentAccountIds
          : [...current.paymentAccountIds, id]
        : current.paymentAccountIds.filter((accountId) => accountId !== id),
    }));
  }

  const manage = (
    <a
      href="/settings/payment-accounts"
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
    >
      {t("payment.manage")}
    </a>
  );

  return (
    <EditorSection title={t("sections.payment")} action={manage}>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted">
          {t("payment.empty")}{" "}
          <a
            href="/settings/payment-accounts"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {t("payment.add")}
          </a>
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {accounts.map((account) => {
            const id = account.snapshot.id;
            const checked = selected.has(id);
            return (
              <li key={id}>
                <label className="flex cursor-pointer items-start gap-3 border border-border px-3.5 py-3 text-sm transition-colors hover:bg-subtle has-[:checked]:border-fg has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && atLimit}
                    onChange={(event) => toggle(id, event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-accent"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-fg">{account.title || "—"}</span>
                    {account.subtitle ? <span className="block truncate text-muted">{account.subtitle}</span> : null}
                  </span>
                  {account.archived ? (
                    <Badge>{t("payment.archived")}</Badge>
                  ) : account.isDefault ? (
                    <Badge variant="info">{t("payment.default")}</Badge>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {errorText("paymentAccountIds") ? <p className="text-xs text-danger">{errorText("paymentAccountIds")}</p> : null}
    </EditorSection>
  );
}
