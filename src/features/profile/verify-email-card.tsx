"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

/**
 * Settings → Account: whether the account's email is verified, with a button that mails the
 * verification link. When email delivery is not configured the card says so instead of offering it.
 */
export function VerifyEmailCard({
  email,
  verified,
  emailEnabled,
}: {
  email: string;
  verified: boolean;
  emailEnabled: boolean;
}) {
  const t = useTranslations("settings.verifyEmail");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function send() {
    setPending(true);
    try {
      const { error } = await authClient.sendVerificationEmail({ email, callbackURL: "/settings?verified=1" });
      if (error) {
        toast.error(t("failed"));
      } else {
        setSent(true);
      }
    } catch {
      toast.error(t("failed"));
    }
    setPending(false);
  }

  return (
    <Card role="region" aria-labelledby="verify-email-title">
      <CardHeader>
        <CardTitle id="verify-email-title">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-fg">{email}</span>
        <Badge variant={verified ? "success" : "warning"}>{verified ? t("verified") : t("unverified")}</Badge>
        {!verified && !emailEnabled ? <span className="text-sm text-muted">{t("disabled")}</span> : null}
        {!verified && emailEnabled ? (
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => void send()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("send")}
          </Button>
        ) : null}
        {!verified && sent ? (
          <p role="status" className="basis-full text-sm text-muted">
            {t("sent", { email })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
