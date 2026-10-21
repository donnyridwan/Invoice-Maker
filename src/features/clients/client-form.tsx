"use client";

import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { CurrencySelect } from "@/components/currency-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LOCALES } from "@/i18n/config";
import { useServerForm } from "@/lib/use-server-form";
import { archiveClientAction, restoreClientAction, saveClientAction } from "./actions";
import type { Client } from "./queries";

const NO_COUNTRY = "__none";

// Countries Indonesian freelancers most often bill; a stored code outside this list is kept as is.
const COMMON_COUNTRIES = [
  "ID", "SG", "MY", "US", "GB", "AU", "NL", "DE", "FR", "JP", "KR", "CN", "HK", "IN", "TH", "PH", "VN", "AE", "SA",
  "CA", "NZ", "CH", "ES", "IT", "SE", "BR",
];

export type ClientFormDefaults = { currency: string; language: string };

export function ClientForm({ client, defaults }: { client: Client | null; defaults: ClientFormDefaults }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [values, setValues] = useState({
    name: client?.name ?? "",
    company: client?.company ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    address: client?.address ?? "",
    country: client?.country ?? "",
    defaultCurrency: client?.defaultCurrency ?? defaults.currency,
    defaultLanguage: client?.defaultLanguage ?? defaults.language,
    notes: client?.notes ?? "",
  });
  const { pending, formError, errorFor, submit } = useServerForm<typeof values>((v) =>
    saveClientAction(client?.id ?? null, v),
  );

  const set = (name: keyof typeof values) => (value: string) => setValues((prev) => ({ ...prev, [name]: value }));
  const invalid = (name: string) => Boolean(errorFor(name)) || undefined;

  const regionNames = new Intl.DisplayNames([locale], { type: "region" });
  const countryCodes = values.country && !COMMON_COUNTRIES.includes(values.country)
    ? [values.country, ...COMMON_COUNTRIES]
    : COMMON_COUNTRIES;
  const countryLabel = (code: string) => {
    try {
      return regionNames.of(code) ?? code;
    } catch {
      return code;
    }
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!(await submit(values))) return;
    toast.success(t("common.saved"));
    if (client) router.refresh();
    else router.push("/clients");
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("clients.name")} htmlFor="client-name" error={errorFor("name")} className="sm:col-span-2">
            <Input
              id="client-name"
              value={values.name}
              aria-invalid={invalid("name")}
              onChange={(e) => set("name")(e.target.value)}
            />
          </FormField>
          <FormField label={t("clients.company")} htmlFor="client-company" error={errorFor("company")}>
            <Input
              id="client-company"
              value={values.company}
              aria-invalid={invalid("company")}
              onChange={(e) => set("company")(e.target.value)}
            />
          </FormField>
          <FormField label={t("clients.email")} htmlFor="client-email" error={errorFor("email")}>
            <Input
              id="client-email"
              type="email"
              value={values.email}
              aria-invalid={invalid("email")}
              onChange={(e) => set("email")(e.target.value)}
            />
          </FormField>
          <FormField label={t("clients.phone")} htmlFor="client-phone" error={errorFor("phone")}>
            <Input
              id="client-phone"
              value={values.phone}
              aria-invalid={invalid("phone")}
              onChange={(e) => set("phone")(e.target.value)}
            />
          </FormField>
          <FormField label={t("clients.country")} htmlFor="client-country" error={errorFor("country")}>
            <Select
              value={values.country || NO_COUNTRY}
              onValueChange={(v) => set("country")(v === NO_COUNTRY ? "" : v)}
            >
              <SelectTrigger id="client-country" aria-invalid={invalid("country")}>
                <SelectValue placeholder={t("clients.countryPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COUNTRY}>{t("clients.countryNone")}</SelectItem>
                {countryCodes.map((code) => (
                  <SelectItem key={code} value={code}>
                    {countryLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("clients.address")} htmlFor="client-address" error={errorFor("address")} className="sm:col-span-2">
            <Textarea
              id="client-address"
              rows={3}
              value={values.address}
              aria-invalid={invalid("address")}
              onChange={(e) => set("address")(e.target.value)}
            />
          </FormField>
          <FormField label={t("clients.defaultCurrency")} htmlFor="client-currency" error={errorFor("defaultCurrency")}>
            <CurrencySelect id="client-currency" value={values.defaultCurrency} onValueChange={set("defaultCurrency")} />
          </FormField>
          <FormField label={t("clients.defaultLanguage")} htmlFor="client-language" error={errorFor("defaultLanguage")}>
            <Select value={values.defaultLanguage} onValueChange={set("defaultLanguage")}>
              <SelectTrigger id="client-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {t(`settings.languages.${code}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("clients.notes")} htmlFor="client-notes" error={errorFor("notes")} className="sm:col-span-2">
            <Textarea
              id="client-notes"
              rows={3}
              value={values.notes}
              aria-invalid={invalid("notes")}
              onChange={(e) => set("notes")(e.target.value)}
            />
          </FormField>

          {formError ? (
            <p role="alert" className="text-sm text-danger sm:col-span-2">
              {formError}
            </p>
          ) : null}

          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {t("common.save")}
            </Button>
            <Button asChild variant="secondary">
              <Link href="/clients">{t("common.cancel")}</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/** Archives an active client or restores an archived one, then refreshes the page. */
export function ClientArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await (archived ? restoreClientAction(id) : archiveClientAction(id));
      if (result.ok) {
        toast.success(t("common.saved"));
        router.refresh();
      } else {
        toast.error(t(`errors.${result.error}`));
      }
    });
  }

  return (
    <Button type="button" variant="secondary" disabled={pending} onClick={onClick}>
      {archived ? t("common.restore") : t("common.archive")}
    </Button>
  );
}
