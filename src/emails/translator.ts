import { createTranslator } from "next-intl";
import type { Locale } from "@/i18n/config";
import en from "@/messages/en.json";
import id from "@/messages/id.json";

/** Translator for the `emails` namespace in `locale` (emails are rendered outside a request's locale). */
export function emailTranslator(locale: Locale) {
  return createTranslator({ locale, messages: locale === "en" ? en : id, namespace: "emails" });
}

export type EmailTranslator = ReturnType<typeof emailTranslator>;
