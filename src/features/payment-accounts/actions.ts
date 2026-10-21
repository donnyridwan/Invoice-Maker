"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { runUserAction } from "@/lib/run-user-action";
import { requireUser } from "@/lib/session";
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
  const user = await requireUser();
  try {
    const saved = id
      ? await updatePaymentAccount(user.id, id, input)
      : await createPaymentAccount(user.id, input);
    revalidatePath(PATH);
    return { ok: true, data: { id: saved.id } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function archivePaymentAccountAction(id: string): Promise<ActionResult> {
  return runUserAction(PATH, (userId) => archivePaymentAccount(userId, id));
}

export async function restorePaymentAccountAction(id: string): Promise<ActionResult> {
  return runUserAction(PATH, (userId) => restorePaymentAccount(userId, id));
}

export async function setDefaultPaymentAccountAction(id: string): Promise<ActionResult> {
  return runUserAction(PATH, (userId) => setDefaultPaymentAccount(userId, id));
}
