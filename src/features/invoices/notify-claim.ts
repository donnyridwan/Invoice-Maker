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

/** How long the public claim request waits for the owner's email before moving on without it. */
export const CLAIM_NOTIFY_TIMEOUT_MS = 5000;

/**
 * Tells the invoice's owner that a client reported a payment. Best effort: nothing is sent when
 * the owner's email is not verified or email is disabled, and any error is logged, never thrown,
 * so a mail problem can never undo the claim. The wait is capped at `CLAIM_NOTIFY_TIMEOUT_MS`, so a
 * slow mail provider cannot stall the client's request. The language is the owner's default invoice language.
 */
export async function notifyOwnerOfClaim(
  claimId: string,
  deps: { transport?: EmailTransport; timeoutMs?: number } = {},
): Promise<void> {
  const timeoutMs = deps.timeoutMs ?? CLAIM_NOTIFY_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.error(`Gave up waiting ${timeoutMs} ms for the payment claim notification`);
      resolve();
    }, timeoutMs);
  });
  try {
    await Promise.race([sendClaimNotification(claimId, deps), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

async function sendClaimNotification(claimId: string, deps: { transport?: EmailTransport }): Promise<void> {
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
