import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, invoices, paymentClaims, user } from "@/db/schema";
import { renderClaimNotificationEmail } from "@/emails/claim-notification-email";
import { resolveLocale } from "@/i18n/config";
import { getAppUrl } from "@/lib/app-url";
import { isCurrencyCode } from "@/lib/currencies";
import { formatDocDate } from "@/lib/dates";
import { fromAddress, getEmailTransport, type EmailTransport } from "@/lib/email";
import { formatMoney } from "@/lib/money";

/**
 * Tells the invoice's owner that a client reported a payment. Best effort: nothing is sent when
 * the owner's email is not verified or email is disabled, and any error is logged, never thrown,
 * so a mail problem can never undo the claim. The language is the owner's default invoice language.
 */
export async function notifyOwnerOfClaim(claimId: string, deps: { transport?: EmailTransport } = {}): Promise<void> {
  try {
    const transport = deps.transport ?? getEmailTransport();
    if (transport.kind === "disabled") return;

    const [row] = await db
      .select({
        claim: paymentClaims,
        invoice: invoices,
        ownerEmail: user.email,
        ownerVerified: user.emailVerified,
        language: businessProfiles.defaultLanguage,
      })
      .from(paymentClaims)
      .innerJoin(invoices, eq(invoices.id, paymentClaims.invoiceId))
      .innerJoin(user, eq(user.id, invoices.userId))
      .leftJoin(businessProfiles, eq(businessProfiles.userId, invoices.userId))
      .where(eq(paymentClaims.id, claimId))
      .limit(1);
    if (!row || !row.ownerVerified) return;

    const language = resolveLocale(row.language);
    const currency = isCurrencyCode(row.invoice.currency) ? row.invoice.currency : "IDR";
    const { subject, html, text } = await renderClaimNotificationEmail({
      language,
      number: row.invoice.number,
      payerName: row.claim.payerName,
      amount: formatMoney(row.claim.amountMinor, currency, language),
      paidOn: formatDocDate(row.claim.paidOn, language),
      note: row.claim.note,
      url: `${getAppUrl()}/invoices/${row.invoice.id}`,
    });
    await transport.send({ from: fromAddress("Invoice Maker"), to: [row.ownerEmail], subject, html, text });
  } catch (e) {
    console.error("Could not notify the owner of a payment claim", e);
  }
}
