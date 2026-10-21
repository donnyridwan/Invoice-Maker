import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, invoices, user } from "@/db/schema";
import { renderRecurringDraftsEmail } from "@/emails/recurring-drafts-email";
import { resolveLocale } from "@/i18n/config";
import { getAppUrl } from "@/lib/app-url";
import { isCurrencyCode } from "@/lib/currencies";
import { fromAddress, getEmailTransport, type EmailTransport } from "@/lib/email";
import { formatMoney } from "@/lib/money";

/**
 * After a recurring run: one summary email per owner for the invoices it generated that are still
 * drafts (every `draft` delivery, plus an `auto_email` invoice that could not be sent). Best effort:
 * nothing is sent when the owner's email is not verified or email is disabled, and any error is
 * logged, never thrown, so a mail problem can never affect the run. The language is the owner's
 * default invoice language; the link is built from the configured app URL, never from a request.
 */
export async function notifyOwnersOfDrafts(
  generatedIds: string[],
  deps: { transport?: EmailTransport } = {},
): Promise<void> {
  if (generatedIds.length === 0) return;
  try {
    const transport = deps.transport ?? getEmailTransport();
    if (transport.kind === "disabled") return;

    const rows = await db
      .select({
        userId: invoices.userId,
        number: invoices.number,
        currency: invoices.currency,
        totalMinor: invoices.totalMinor,
        clientName: invoices.clientSnapshot,
        ownerEmail: user.email,
        ownerVerified: user.emailVerified,
        language: businessProfiles.defaultLanguage,
      })
      .from(invoices)
      .innerJoin(user, eq(user.id, invoices.userId))
      .leftJoin(businessProfiles, eq(businessProfiles.userId, invoices.userId))
      .where(and(inArray(invoices.id, generatedIds), eq(invoices.status, "draft")))
      .orderBy(asc(invoices.createdAt), asc(invoices.number));

    const byOwner = new Map<string, typeof rows>();
    for (const row of rows) byOwner.set(row.userId, [...(byOwner.get(row.userId) ?? []), row]);

    for (const [userId, drafts] of byOwner) {
      try {
        const [first] = drafts;
        if (!first.ownerVerified) continue;
        const language = resolveLocale(first.language);
        const { subject, html, text } = await renderRecurringDraftsEmail({
          language,
          drafts: drafts.map((d) => ({
            number: d.number,
            clientName: d.clientName?.name ?? "",
            total: formatMoney(d.totalMinor, isCurrencyCode(d.currency) ? d.currency : "IDR", language),
          })),
          url: `${getAppUrl()}/invoices?tab=draft`,
        });
        await transport.send({ from: fromAddress("Invoice Maker"), to: [first.ownerEmail], subject, html, text });
      } catch (e) {
        console.error(`[recurring] could not notify user ${userId} of their drafts`, e);
      }
    }
  } catch (e) {
    console.error("[recurring] could not notify owners of their drafts", e);
  }
}
