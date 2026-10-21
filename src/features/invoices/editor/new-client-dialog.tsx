"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { CurrencySelect } from "@/components/currency-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClientInlineAction, type InlineClient } from "@/features/clients/actions";
import { LOCALES } from "@/i18n/config";
import { useServerForm } from "@/lib/use-server-form";

type Values = { name: string; email: string; company: string; defaultCurrency: string; defaultLanguage: string };

/**
 * The short "new client" form (name, email, company, currency, language) shown over the editor.
 * `defaults` come from the invoice being edited; on success `onCreated` gets the saved client.
 */
export function NewClientDialog({
  open,
  onOpenChange,
  initialName,
  defaults,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  defaults: { currency: string; language: string };
  onCreated: (client: InlineClient) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mounted only while open, so every opening starts with a fresh form. */}
      {open ? (
        <NewClientForm
          initialName={initialName}
          defaults={defaults}
          onCancel={() => onOpenChange(false)}
          onCreated={(client) => {
            onOpenChange(false);
            onCreated(client);
          }}
        />
      ) : null}
    </Dialog>
  );
}

function NewClientForm({
  initialName,
  defaults,
  onCancel,
  onCreated,
}: {
  initialName: string;
  defaults: { currency: string; language: string };
  onCancel: () => void;
  onCreated: (client: InlineClient) => void;
}) {
  const t = useTranslations();
  const [values, setValues] = useState<Values>({
    name: initialName,
    email: "",
    company: "",
    defaultCurrency: defaults.currency,
    defaultLanguage: defaults.language,
  });
  const { pending, formError, errorFor, submit } = useServerForm<Values>(async (v) => {
    const result = await createClientInlineAction(v);
    if (result.ok) onCreated(result.data);
    return result;
  });

  const set = (name: keyof Values) => (value: string) => setValues((prev) => ({ ...prev, [name]: value }));
  const invalid = (name: string) => Boolean(errorFor(name)) || undefined;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await submit(values);
  }

  return (
    <DialogContent
      // Focus goes back to nothing in particular: returning it to the client field would reopen its list.
      onCloseAutoFocus={(event) => event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{t("clients.new")}</DialogTitle>
        <DialogDescription>{t("invoices.editor.newClient.description")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("clients.name")} htmlFor="new-client-name" error={errorFor("name")} className="sm:col-span-2">
          <Input
            id="new-client-name"
            value={values.name}
            autoFocus
            autoComplete="off"
            aria-invalid={invalid("name")}
            onChange={(e) => set("name")(e.target.value)}
          />
        </FormField>
        <FormField label={t("clients.email")} htmlFor="new-client-email" error={errorFor("email")}>
          <Input
            id="new-client-email"
            type="email"
            value={values.email}
            autoComplete="off"
            aria-invalid={invalid("email")}
            onChange={(e) => set("email")(e.target.value)}
          />
        </FormField>
        <FormField label={t("clients.company")} htmlFor="new-client-company" error={errorFor("company")}>
          <Input
            id="new-client-company"
            value={values.company}
            autoComplete="off"
            aria-invalid={invalid("company")}
            onChange={(e) => set("company")(e.target.value)}
          />
        </FormField>
        <FormField label={t("clients.defaultCurrency")} htmlFor="new-client-currency" error={errorFor("defaultCurrency")}>
          <CurrencySelect id="new-client-currency" value={values.defaultCurrency} onValueChange={set("defaultCurrency")} />
        </FormField>
        <FormField label={t("clients.defaultLanguage")} htmlFor="new-client-language" error={errorFor("defaultLanguage")}>
          <Select value={values.defaultLanguage} onValueChange={set("defaultLanguage")}>
            <SelectTrigger id="new-client-language">
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
        {formError ? (
          <p role="alert" className="text-sm text-danger sm:col-span-2">
            {formError}
          </p>
        ) : null}
        <DialogFooter className="sm:col-span-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
