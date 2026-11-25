"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setLocale } from "@/i18n/actions";
import { LOCALES, resolveLocale } from "@/i18n/config";

/**
 * The language of the app itself (menus, buttons, messages) for this account; the language of the
 * invoices is a separate default in the invoice defaults.
 */
export function LanguageCard() {
  const t = useTranslations("settings");
  const current = resolveLocale(useLocale());
  const [pending, startTransition] = useTransition();

  function change(value: string) {
    const locale = resolveLocale(value);
    if (locale === current) return;
    startTransition(async () => {
      await setLocale(locale);
      toast.success(t("uiLanguageSaved", { language: t(`languages.${locale}`) }));
    });
  }

  return (
    <Card role="region" aria-labelledby="ui-language-title">
      <CardHeader>
        <CardTitle id="ui-language-title">{t("uiLanguage")}</CardTitle>
        <CardDescription>{t("uiLanguageDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FormField label={t("uiLanguage")} htmlFor="uiLanguage" className="max-w-xs">
          <Select value={current} onValueChange={change} disabled={pending}>
            <SelectTrigger id="uiLanguage">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCALES.map((locale) => (
                <SelectItem key={locale} value={locale}>
                  {t(`languages.${locale}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </CardContent>
    </Card>
  );
}
