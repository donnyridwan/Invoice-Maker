import type { Locale } from "@/i18n/config";
import en from "@/messages/en.json";
import id from "@/messages/id.json";

/**
 * The messages the public invoice page needs in the browser, in the invoice's language (which is
 * independent of the viewer's UI locale cookie).
 */
export function publicMessages(locale: Locale) {
  const all = locale === "en" ? en : id;
  return { public: all.public, validation: all.validation, errors: all.errors, common: all.common };
}
