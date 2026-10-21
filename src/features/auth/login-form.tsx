"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { safeNextPath } from "./safe-next";

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");

    if (!email || !password) {
      setError(t("validation.required"));
      return;
    }

    setError(null);
    setPending(true);
    const { error: authError } = await authClient.signIn.email({ email, password });
    if (authError) {
      setPending(false);
      setError(
        authError.status === 401 || authError.status === 400
          ? t("auth.invalidCredentials")
          : t("common.genericError"),
      );
      return;
    }
    // Full page load so the server re-evaluates the session (and any onboarding redirect).
    window.location.href = safeNextPath(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("auth.signInTitle")}</CardTitle>
        <CardDescription>{t("auth.signInDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {t("auth.signIn")}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          {t("auth.noAccount")}{" "}
          <Link href="/register" className="font-medium text-accent hover:underline">
            {t("auth.signUp")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
