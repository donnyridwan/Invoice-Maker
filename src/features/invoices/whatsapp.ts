import type { Locale } from "@/i18n/config";
import { emailTranslator } from "@/emails/translator";

/** Fewer digits than this is not a phone number. */
const MIN_DIGITS = 8;

/**
 * A phone number as wa.me wants it: digits only, country code first. A leading `+` is dropped with
 * every other non-digit; the `00` international call prefix is stripped; a leading `0` becomes
 * Indonesia's `62`, and the trunk `0` written after the country code (`+62 (0)812...`, `62 0812...`)
 * is dropped. Fewer than 8 digits (or nothing) gives null: the message is then shared without a recipient.
 */
export function normalizeWhatsAppNumber(input: string | null | undefined): string | null {
  const raw = (input ?? "").replace(/\D/g, "");
  if (raw.length < MIN_DIGITS) return null;
  let digits = raw.startsWith("00") ? raw.replace(/^0+/, "") : raw;
  if (digits.startsWith("620")) digits = `62${digits.replace(/^620+/, "")}`;
  else if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  return digits.length < MIN_DIGITS ? null : digits;
}

export type WhatsAppMessageFacts = {
  language: Locale;
  clientName: string;
  number: string;
  businessName: string;
  /** The total already formatted for the invoice's currency and language. */
  total: string;
  /** The due date already formatted for the invoice's language. */
  dueDate: string;
  /** The absolute public link of the invoice. */
  url: string;
};

/** The prefilled WhatsApp message, in the invoice's language. */
export function whatsAppMessage(inv: WhatsAppMessageFacts): string {
  const t = emailTranslator(inv.language);
  return t("whatsapp.message", {
    clientName: inv.clientName,
    number: inv.number,
    businessName: inv.businessName,
    total: inv.total,
    dueDate: inv.dueDate,
    url: inv.url,
  });
}

/** `https://wa.me/<number>?text=<message>`, or `https://wa.me/?text=<message>` without a number. */
export function whatsAppUrl(number: string | null, message: string): string {
  return `https://wa.me/${number ?? ""}?text=${encodeURIComponent(message)}`;
}
