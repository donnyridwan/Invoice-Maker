import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { renderInvoiceEmail } from "@/emails/invoice-email";
import { db } from "@/db/client";
import { invoiceEvents, invoices } from "@/db/schema";
import { resolveLocale } from "@/i18n/config";
import { getAppUrl } from "@/lib/app-url";
import { isCurrencyCode } from "@/lib/currencies";
import { formatDocDate } from "@/lib/dates";
import { fromAddress, getEmailTransport, type EmailTransport } from "@/lib/email";
import { ValidationError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { pdfFilename } from "@/lib/pdf/response";
import { parseInput } from "@/lib/validate";
import { requiredEmail } from "@/lib/zod-helpers";
import { defaultInvoiceEmail } from "./email-content";
import { logEvent } from "./events";
import { assertSendable, markSent } from "./lifecycle";
import { getInvoice, type InvoiceWithItems } from "./queries";

export { notifyOwnerOfClaim } from "./notify-claim";

/** Invoice emails one user may send per rolling 24 hours (counted from `sent_email` events). */
export const DAILY_EMAIL_LIMIT = 50;
export const MAX_CC = 5;

const subject = z
  .string("required")
  .transform((value) => value.replace(/[\r\n]+/g, " ").trim())
  .pipe(z.string().min(1, "required").max(200, "tooLong:200"));

const cc = z.preprocess(
  (value) => (value === undefined || value === null ? [] : value),
  z
    .array(z.string("invalidEmail"))
    .transform((list) => list.map((address) => address.trim()).filter(Boolean))
    .superRefine((list, ctx) => {
      if (list.length > MAX_CC) {
        ctx.addIssue({ code: "custom", message: `tooManyRecipients:${MAX_CC}` });
      } else if (list.some((address) => !z.email().safeParse(address).success)) {
        ctx.addIssue({ code: "custom", message: "invalidEmail" });
      }
    }),
);

export const sendInvoiceEmailSchema = z.object({
  to: requiredEmail,
  cc,
  subject,
  message: z.preprocess((value) => value ?? "", z.string("required").max(5000, "tooLong:5000")),
});

export type SendInvoiceEmailInput = z.input<typeof sendInvoiceEmailSchema>;

export type EmailSender = { id: string; email: string; emailVerified: boolean };

type Deps = {
  transport?: EmailTransport;
  renderPdf?: (invoiceId: string) => Promise<Uint8Array>;
};

function formError(code: string): ValidationError {
  return new ValidationError({ _form: [code] });
}

/** Facts about an invoice that the email text is built from, in the invoice's language. */
function emailFacts(inv: InvoiceWithItems) {
  const language = resolveLocale(inv.language);
  const currency = isCurrencyCode(inv.currency) ? inv.currency : "IDR";
  return {
    language,
    number: inv.number,
    businessName: inv.businessSnapshot.businessName.trim() || "Invoice Maker",
    clientName: inv.clientSnapshot?.name ?? "",
    total: formatMoney(inv.totalMinor, currency, language),
    dueDate: formatDocDate(inv.dueDate, language),
  };
}

/** What the "Kirim lewat email" dialog starts from: the client's address and the default subject and message. */
export async function getInvoiceEmailDefaults(
  userId: string,
  invoiceId: string,
): Promise<{ to: string; subject: string; message: string }> {
  const inv = await getInvoice(userId, invoiceId);
  return { to: inv.clientSnapshot?.email ?? "", ...defaultInvoiceEmail(emailFacts(inv)) };
}

async function sentTodayCount(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [row] = await db
    .select({ n: count() })
    .from(invoiceEvents)
    .innerJoin(invoices, eq(invoices.id, invoiceEvents.invoiceId))
    .where(and(eq(invoices.userId, userId), eq(invoiceEvents.type, "sent_email"), gte(invoiceEvents.createdAt, since)));
  return row.n;
}

/**
 * Emails the invoice (link, message and the PDF as an attachment) to the client and marks it sent.
 * Everything is enforced here, not in the UI: the invoice must be the user's and sendable, the
 * user's email verified, a transport configured, the daily limit not reached and the input valid.
 * A delivery failure is logged as `email_failed`, leaves the status alone and surfaces as `emailFailed`.
 */
export async function sendInvoiceEmail(
  user: EmailSender,
  invoiceId: string,
  input: unknown,
  deps: Deps = {},
): Promise<void> {
  const inv = await getInvoice(user.id, invoiceId);
  if (inv.status === "void") throw formError("invalidTransition");
  assertSendable(inv);

  const transport = deps.transport ?? getEmailTransport();
  if (!user.emailVerified) throw formError("emailNotVerified");
  if (transport.kind === "disabled") throw formError("emailDisabled");

  const data = parseInput(sendInvoiceEmailSchema, input);
  if ((await sentTodayCount(user.id)) >= DAILY_EMAIL_LIMIT) throw formError("rateLimited");

  const facts = emailFacts(inv);
  try {
    const renderPdf = deps.renderPdf ?? (await import("@/lib/pdf/render")).renderInvoicePdf;
    const pdf = await renderPdf(inv.id);
    const { html, text } = await renderInvoiceEmail({
      language: facts.language,
      businessName: facts.businessName,
      number: inv.number,
      total: facts.total,
      dueDate: facts.dueDate,
      message: data.message,
      url: `${getAppUrl()}/i/${inv.publicToken}`,
    });
    await transport.send({
      from: fromAddress(facts.businessName),
      to: [data.to],
      cc: data.cc.length > 0 ? data.cc : undefined,
      replyTo: user.email,
      subject: data.subject,
      html,
      text,
      attachments: [{ filename: pdfFilename(inv.number), content: pdf }],
    });
  } catch (e) {
    console.error(e);
    const message = e instanceof Error ? e.message : String(e);
    await logEvent(db, inv.id, "email_failed", { error: message.slice(0, 500) });
    throw formError("emailFailed");
  }

  // The email is out: whatever happens to the status change, it counts towards the daily limit.
  try {
    if (inv.status === "draft") await markSent(user.id, inv.id, "email");
  } finally {
    await logEvent(db, inv.id, "sent_email", { to: data.to, cc: data.cc });
  }
}
