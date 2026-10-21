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
import { CURRENCY_CODES } from "@/lib/currencies";
import { useServerForm } from "@/lib/use-server-form";
import { saveProfileAction } from "./actions";
import type { BusinessProfile } from "./queries";

export function CurrencySelect({
  id,
  value,
  onValueChange,
  name,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} name={name}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CURRENCY_CODES.map((code) => (
          <SelectItem key={code} value={code}>
            {code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProfileForm({ profile }: { profile: BusinessProfile }) {
  const t = useTranslations();
  const router = useRouter();
  const [values, setValues] = useState({
    businessName: profile.businessName ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    address: profile.address ?? "",
    taxId: profile.taxId ?? "",
    baseCurrency: profile.baseCurrency,
    defaultCurrency: profile.defaultCurrency,
  });
  const { pending, formError, errorFor, submit } = useServerForm<typeof values>((v) => saveProfileAction(v));

  const set = (name: keyof typeof values) => (value: string) => setValues((prev) => ({ ...prev, [name]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (await submit(values)) {
      toast.success(t("common.saved"));
      router.refresh();
    }
  }

  return (
    <Card role="region" aria-labelledby="profile-title">
        <CardHeader>
          <CardTitle id="profile-title">{t("settings.businessProfile")}</CardTitle>
          <CardDescription>{t("settings.businessProfileDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("settings.businessName")} htmlFor="businessName" error={errorFor("businessName")} className="sm:col-span-2">
              <Input id="businessName" value={values.businessName} onChange={(e) => set("businessName")(e.target.value)} aria-invalid={Boolean(errorFor("businessName")) || undefined} />
            </FormField>
            <FormField label={t("settings.email")} htmlFor="email" error={errorFor("email")}>
              <Input id="email" type="email" value={values.email} onChange={(e) => set("email")(e.target.value)} aria-invalid={Boolean(errorFor("email")) || undefined} />
            </FormField>
            <FormField label={t("settings.phone")} htmlFor="phone" error={errorFor("phone")}>
              <Input id="phone" value={values.phone} onChange={(e) => set("phone")(e.target.value)} />
            </FormField>
            <FormField label={t("settings.address")} htmlFor="address" error={errorFor("address")} className="sm:col-span-2">
              <Textarea id="address" rows={3} value={values.address} onChange={(e) => set("address")(e.target.value)} aria-invalid={Boolean(errorFor("address")) || undefined} />
            </FormField>
            <FormField label={t("settings.taxId")} htmlFor="taxId" error={errorFor("taxId")} className="sm:col-span-2">
              <Input id="taxId" value={values.taxId} onChange={(e) => set("taxId")(e.target.value)} />
            </FormField>
            <FormField label={t("settings.baseCurrency")} htmlFor="baseCurrency" hint={t("settings.baseCurrencyHint")} error={errorFor("baseCurrency")}>
              <CurrencySelect id="baseCurrency" value={values.baseCurrency} onValueChange={set("baseCurrency")} />
            </FormField>
            <FormField label={t("settings.defaultCurrency")} htmlFor="defaultCurrency" hint={t("settings.defaultCurrencyHint")} error={errorFor("defaultCurrency")}>
              <CurrencySelect id="defaultCurrency" value={values.defaultCurrency} onValueChange={set("defaultCurrency")} />
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
