"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { getAppUrl } from "@/lib/app-url";
import { NotFoundError } from "@/lib/errors";
import { runUserAction } from "@/lib/run-user-action";
import { requireUser } from "@/lib/session";
import { markPaid, markSent, unmarkPaid, voidInvoice } from "./lifecycle";
import { shareWhatsApp } from "./share-whatsapp";
import { getInvoiceEmailDefaults, sendInvoiceEmail, type SendInvoiceEmailInput } from "./send-email";
import { createDraftInvoice, deleteInvoice, duplicateInvoice, saveInvoiceDraft } from "./queries";
import type { InvoiceDraftInput } from "./schema";

/** Pages that show an invoice's status: the list, the detail page, the editor and the dashboard. */
function revalidateInvoicePages(): void {
  revalidatePath("/invoices", "layout");
  revalidatePath("/dashboard");
}

/** Runs a lifecycle change for the signed-in user and revalidates the pages that show the status. */
async function runLifecycle<T>(action: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  try {
    const data = await action(user.id);
    revalidateInvoicePages();
    return { ok: true, data };
  } catch (e) {
    return toActionError(e);
  }
}

const PATH = "/invoices";

/** Creates a draft (optionally for `clientId`) and opens it in the editor. */
export async function createInvoiceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const raw = formData.get("clientId");
  const clientId = typeof raw === "string" && raw !== "" ? raw : undefined;

  let id: string;
  try {
    id = (await createDraftInvoice(user.id, { clientId })).id;
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  revalidatePath(PATH);
  redirect(`/invoices/${id}/edit`);
}

export async function saveInvoiceDraftAction(
  id: string,
  input: InvoiceDraftInput,
): Promise<ActionResult<{ savedAt: string }>> {
  const user = await requireUser();
  try {
    // No revalidatePath: autosave must not re-render the edit page on every save, and the (dynamic)
    // invoice list reads fresh data on each visit.
    const { savedAt } = await saveInvoiceDraft(user.id, id, input);
    return { ok: true, data: { savedAt } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function duplicateInvoiceAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    const copy = await duplicateInvoice(user.id, id);
    revalidatePath(PATH);
    return { ok: true, data: { id: copy.id } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteInvoiceAction(id: string): Promise<ActionResult> {
  return runUserAction(PATH, (userId) => deleteInvoice(userId, id));
}

/** The user hands the invoice over by other means: draft → sent, no link is produced. */
export async function markSentAction(id: string): Promise<ActionResult> {
  return runLifecycle(async (userId) => {
    await markSent(userId, id, "manual");
  });
}

/**
 * "Salin link": sends a draft (it must be sendable), logs the share and returns the absolute
 * public URL for the browser to put on the clipboard.
 */
export async function copyLinkAction(id: string): Promise<ActionResult<{ url: string }>> {
  const base = getAppUrl(await headers());
  return runLifecycle(async (userId) => {
    const invoice = await markSent(userId, id, "link");
    return { url: `${base}/i/${invoice.publicToken}` };
  });
}

/**
 * "WhatsApp": sends a draft (it must be sendable) or logs the share, and returns the wa.me link
 * (client's number, prefilled message with the public link) for the browser to open.
 */
export async function shareWhatsAppAction(id: string): Promise<ActionResult<{ url: string }>> {
  return runLifecycle((userId) => shareWhatsApp(userId, id));
}

export async function markPaidAction(
  id: string,
  input: { paidOn: string; note?: string },
): Promise<ActionResult> {
  return runLifecycle(async (userId) => {
    await markPaid(userId, id, input);
  });
}

export async function unmarkPaidAction(id: string): Promise<ActionResult> {
  return runLifecycle(async (userId) => {
    await unmarkPaid(userId, id);
  });
}

export async function voidInvoiceAction(id: string): Promise<ActionResult> {
  return runLifecycle(async (userId) => {
    await voidInvoice(userId, id);
  });
}

/**
 * "Kirim lewat email": the invoice goes to the client with its PDF attached (draft → sent). The
 * verified flag comes from the session, and `sendInvoiceEmail` enforces every prerequisite.
 */
export async function sendInvoiceEmailAction(id: string, input: SendInvoiceEmailInput): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await sendInvoiceEmail(user, id, input);
    revalidateInvoicePages();
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

export type EmailDialogData = {
  to: string;
  subject: string;
  message: string;
  /** The account's email address and whether it is verified (the dialog asks to verify first if not). */
  accountEmail: string;
  verified: boolean;
};

/** Everything the email dialog needs, read fresh when it opens (after the editor flushed its changes). */
export async function getEmailDialogDataAction(id: string): Promise<ActionResult<EmailDialogData>> {
  const user = await requireUser();
  try {
    const defaults = await getInvoiceEmailDefaults(user.id, id);
    return { ok: true, data: { ...defaults, accountEmail: user.email, verified: user.emailVerified } };
  } catch (e) {
    return toActionError(e);
  }
}
