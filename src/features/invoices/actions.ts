"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { NotFoundError } from "@/lib/errors";
import { runUserAction } from "@/lib/run-user-action";
import { requireUser } from "@/lib/session";
import { createDraftInvoice, deleteDraftInvoice, duplicateInvoice, saveInvoiceDraft } from "./queries";
import type { InvoiceDraftInput } from "./schema";

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

export async function deleteDraftInvoiceAction(id: string): Promise<ActionResult> {
  return runUserAction(PATH, (userId) => deleteDraftInvoice(userId, id));
}
