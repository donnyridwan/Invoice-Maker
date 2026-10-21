"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

const MIN_PASSWORD_LENGTH = 8;

export function AccountCard() {
  const t = useTranslations();
  const [error, setError] = useState<{ field: "current" | "new" | "form"; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");

    if (!currentPassword) return setError({ field: "current", message: t("validation.required") });
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return setError({ field: "new", message: t("validation.passwordMin") });
    }

    setError(null);
    setPending(true);
    const { error: authError } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);

    if (authError) {
      setError(
        authError.code === "INVALID_PASSWORD"
          ? { field: "current", message: t("auth.wrongCurrentPassword") }
          : { field: "form", message: t("common.genericError") },
      );
      return;
    }
    form.reset();
    toast.success(t("common.saved"));
  }

  return (
    <Card role="region" aria-labelledby="account-title">
      <CardHeader>
        <CardTitle id="account-title">{t("settings.account")}</CardTitle>
        <CardDescription>{t("settings.accountDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Link
          href="/settings/payment-accounts"
          className="flex items-center justify-between rounded-md border border-border px-4 py-3 text-sm font-medium text-fg hover:bg-subtle"
        >
          {t("nav.paymentAccounts")}
          <ChevronRight className="size-4 text-muted" />
        </Link>

        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <h3 className="text-sm font-semibold text-fg sm:col-span-2">{t("settings.changePassword")}</h3>
          <FormField label={t("settings.currentPassword")} htmlFor="currentPassword" error={error?.field === "current" ? error.message : undefined}>
            <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" />
          </FormField>
          <FormField label={t("settings.newPassword")} htmlFor="newPassword" error={error?.field === "new" ? error.message : undefined}>
            <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" />
          </FormField>
          {error?.field === "form" ? (
            <p role="alert" className="text-sm text-danger sm:col-span-2">
              {error.message}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" variant="secondary" disabled={pending}>
              {t("settings.changePassword")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
