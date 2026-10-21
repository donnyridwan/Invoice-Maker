import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/session";

/**
 * Shared body of the thin mutation server actions: require a signed-in user, run `action` with
 * the user's id, revalidate `path` and wrap the outcome (or the error) in an `ActionResult`.
 */
export async function runUserAction(
  path: string,
  action: (userId: string) => Promise<void>,
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await action(user.id);
    revalidatePath(path);
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}
