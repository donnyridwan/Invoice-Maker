"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { runWorkspaceAction } from "@/lib/run-workspace-action";
import { requireWorkspace } from "@/lib/workspace";
import {
  archivePaymentAccount,
  createPaymentAccount,
  restorePaymentAccount,
  setDefaultPaymentAccount,
  updatePaymentAccount,
} from "./queries";

const PATH = "/settings/payment-accounts";

/** Creates (id null) or updates a payment account. `input` is validated by the zod schema. */
export async function savePaymentAccountAction(
  id: string | null,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const { workspaceId } = await requireWorkspace();
  try {
    const saved = id
      ? await updatePaymentAccount(workspaceId, id, input)
      : await createPaymentAccount(workspaceId, input);
    revalidatePath(PATH);
    return { ok: true, data: { id: saved.id } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function archivePaymentAccountAction(id: string): Promise<ActionResult> {
  return runWorkspaceAction(PATH, (workspaceId) => archivePaymentAccount(workspaceId, id));
}

export async function restorePaymentAccountAction(id: string): Promise<ActionResult> {
  return runWorkspaceAction(PATH, (workspaceId) => restorePaymentAccount(workspaceId, id));
}

export async function setDefaultPaymentAccountAction(id: string): Promise<ActionResult> {
  return runWorkspaceAction(PATH, (workspaceId) => setDefaultPaymentAccount(workspaceId, id));
}
