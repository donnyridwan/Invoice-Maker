"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export function RegisterForm() {
  const t = useTranslations();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");

    if (!name || !email || !password) {
      setError(t("validation.required"));
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setError(t("validation.invalidEmail"));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("validation.passwordMin"));
      return;
    }

    setError(null);
    setPending(true);
    const { error: authError } = await authClient.signUp.email({ name, email, password });
    if (authError) {
      setPending(false);
      setError(
        authError.code === "USER_ALREADY_EXISTS" ||
          authError.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
          ? t("auth.emailTaken")
          : authError.code === "PASSWORD_TOO_SHORT"
            ? t("validation.passwordMin")
            : t("common.genericError"),
      );
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("auth.signUpTitle")}</CardTitle>
        <CardDescription>{t("auth.signUpDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">{t("auth.name")}</Label>
            <Input id="name" name="name" autoComplete="name" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input id="email" name="email" type="email" autoComplete="email" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {t("auth.signUp")}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          {t("auth.haveAccount")}{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            {t("auth.signIn")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
