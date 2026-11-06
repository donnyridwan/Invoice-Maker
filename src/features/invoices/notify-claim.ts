import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, invoices, paymentClaims } from "@/db/schema";
import { verifiedMemberEmails } from "@/features/workspaces/queries";
import { renderClaimNotificationEmail } from "@/emails/claim-notification-email";
import { resolveLocale } from "@/i18n/config";
import { getAppUrl } from "@/lib/app-url";
import { isCurrencyCode } from "@/lib/currencies";
import { formatDocDate } from "@/lib/dates";
import { fromAddress, getEmailTransport, type EmailTransport } from "@/lib/email";
import { formatMoney } from "@/lib/money";

/** How long the public claim request waits for the members' email before moving on without it. */
export const CLAIM_NOTIFY_TIMEOUT_MS = 5000;

/**
 * Tells the members of the invoice's workspace that a client reported a payment. Best effort: only
 * members with a verified email get it, nothing is sent when email is disabled, and any error is logged, never thrown,
 * so a mail problem can never undo the claim. The wait is capped at `CLAIM_NOTIFY_TIMEOUT_MS`, so a
 * slow mail provider cannot stall the client's request. The language is the workspace's default invoice language.
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
      .select({ claim: paymentClaims, invoice: invoices, language: businessProfiles.defaultLanguage })
      .from(paymentClaims)
      .innerJoin(invoices, eq(invoices.id, paymentClaims.invoiceId))
      .leftJoin(businessProfiles, eq(businessProfiles.workspaceId, invoices.workspaceId))
      .where(eq(paymentClaims.id, claimId))
      .limit(1);
    if (!row) return;
    const recipients = await verifiedMemberEmails(row.invoice.workspaceId);
    if (recipients.length === 0) return;

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
    // One email each, so members do not see each other's addresses.
    for (const to of recipients) {
      await transport.send({ from: fromAddress("Invoice Maker"), to: [to], subject, html, text });
    }
  } catch (e) {
    console.error("Could not notify the members of a payment claim", e);
  }
}
