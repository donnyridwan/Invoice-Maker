import { getAppUrl } from "@/lib/app-url";
import { assertSendable, markSent } from "./lifecycle";
import { getInvoice } from "./queries";
import { emailFacts } from "./send-email";
import { normalizeWhatsAppNumber, whatsAppMessage, whatsAppUrl } from "./whatsapp";

/**
 * "Bagikan lewat WhatsApp": checks the invoice can go out, sends a draft (or just logs the share on
 * one already sent) and returns the wa.me link with the prefilled message, addressed to the
 * client's phone number when it is usable. The public link in the message is built from the
 * environment only (`APP_URL`), never from request headers.
 */
export async function shareWhatsApp(
  userId: string,
  invoiceId: string,
  baseUrl: string = getAppUrl(),
): Promise<{ url: string }> {
  const inv = await getInvoice(userId, invoiceId);
  assertSendable(inv);
  // Also rejects a void invoice and does the draft -> sent change plus the event.
  await markSent(userId, invoiceId, "whatsapp");

  const message = whatsAppMessage({ ...emailFacts(inv), url: `${baseUrl}/i/${inv.publicToken}` });
  return { url: whatsAppUrl(normalizeWhatsAppNumber(inv.clientSnapshot?.phone), message) };
}
