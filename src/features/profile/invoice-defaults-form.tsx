"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useServerForm } from "@/lib/use-server-form";
import { saveInvoiceDefaultsAction } from "./actions";
import type { BusinessProfile } from "./queries";
import { INVOICE_LANGUAGES, TEMPLATES } from "./schema";

export function InvoiceDefaultsForm({ profile }: { profile: BusinessProfile }) {
  const t = useTranslations();
  const router = useRouter();
  const [values, setValues] = useState({
    invoicePrefix: profile.invoicePrefix,
    defaultDueDays: String(profile.defaultDueDays),
    defaultLanguage: profile.defaultLanguage,
    defaultTemplate: profile.defaultTemplate,
    accentColor: profile.accentColor,
    defaultNotes: profile.defaultNotes ?? "",
  });
  const { pending, formError, errorFor, submit } = useServerForm<typeof values>((v) =>
    saveInvoiceDefaultsAction(v),
  );

  const set = (name: keyof typeof values) => (value: string) => setValues((prev) => ({ ...prev, [name]: value }));
  const invalid = (name: string) => Boolean(errorFor(name)) || undefined;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (await submit(values)) {
      toast.success(t("common.saved"));
      router.refresh();
    }
  }

  return (
    <Card role="region" aria-labelledby="defaults-title">
      <CardHeader>
        <CardTitle id="defaults-title">{t("settings.invoiceDefaults")}</CardTitle>
        <CardDescription>{t("settings.invoiceDefaultsDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("settings.invoicePrefix")} htmlFor="invoicePrefix" error={errorFor("invoicePrefix")}>
            <Input id="invoicePrefix" value={values.invoicePrefix} onChange={(e) => set("invoicePrefix")(e.target.value)} aria-invalid={invalid("invoicePrefix")} />
          </FormField>
          <FormField label={t("settings.defaultDueDays")} htmlFor="defaultDueDays" error={errorFor("defaultDueDays")}>
            <Input id="defaultDueDays" inputMode="numeric" value={values.defaultDueDays} onChange={(e) => set("defaultDueDays")(e.target.value)} aria-invalid={invalid("defaultDueDays")} />
          </FormField>
          <FormField label={t("settings.defaultLanguage")} htmlFor="defaultLanguage" error={errorFor("defaultLanguage")}>
            <Select value={values.defaultLanguage} onValueChange={set("defaultLanguage")}>
              <SelectTrigger id="defaultLanguage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVOICE_LANGUAGES.map((language) => (
                  <SelectItem key={language} value={language}>
                    {t(`settings.languages.${language}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("settings.defaultTemplate")} htmlFor="defaultTemplate" error={errorFor("defaultTemplate")}>
            <Select value={values.defaultTemplate} onValueChange={set("defaultTemplate")}>
              <SelectTrigger id="defaultTemplate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((template) => (
                  <SelectItem key={template} value={template}>
                    {t(`settings.templates.${template}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("settings.accentColor")} htmlFor="accentColor" error={errorFor("accentColor")} className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={t("settings.accentColor")}
                value={/^#[0-9A-Fa-f]{6}$/.test(values.accentColor) ? values.accentColor : "#111111"}
                onChange={(e) => set("accentColor")(e.target.value.toUpperCase())}
                className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-white p-1"
              />
              <Input id="accentColor" value={values.accentColor} onChange={(e) => set("accentColor")(e.target.value)} aria-invalid={invalid("accentColor")} className="max-w-40 font-mono" />
            </div>
          </FormField>
          <FormField label={t("settings.defaultNotes")} htmlFor="defaultNotes" error={errorFor("defaultNotes")} className="sm:col-span-2">
            <Textarea id="defaultNotes" rows={3} value={values.defaultNotes} onChange={(e) => set("defaultNotes")(e.target.value)} aria-invalid={invalid("defaultNotes")} />
          </FormField>
          {formError ? (
            <p role="alert" className="text-sm text-danger sm:col-span-2">
              {formError}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
