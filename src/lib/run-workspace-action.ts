import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { requireWorkspace } from "@/lib/workspace";

/**
 * Shared body of the thin mutation server actions: require a signed-in member of a workspace, run
 * `action` with the active workspace's id, revalidate `path` and wrap the outcome (or the error)
 * in an `ActionResult`.
 */
export async function runWorkspaceAction(
  path: string,
  action: (workspaceId: string) => Promise<void>,
): Promise<ActionResult> {
  const { workspaceId } = await requireWorkspace();
  try {
    await action(workspaceId);
    revalidatePath(path);
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}
