import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { listUserWorkspaces, type WorkspaceSummary } from "@/features/workspaces/queries";
import { requireUser, type SessionUser } from "@/lib/session";

/** The workspace last picked in the switcher; only ever trusted after a membership check. */
export const WORKSPACE_COOKIE = "workspace";

export type WorkspaceContext = {
  user: SessionUser;
  /** The active workspace, which the user is a member of. */
  workspace: WorkspaceSummary;
  /** Every workspace the user belongs to, for the switcher. */
  workspaces: WorkspaceSummary[];
};

/**
 * The signed-in user and their workspaces, with the active one: the one in the cookie when they
 * still belong to it, else their first. Null `workspace` when they belong to none yet.
 */
export const getWorkspaceContext = cache(
  async (): Promise<Omit<WorkspaceContext, "workspace"> & { workspace: WorkspaceSummary | null }> => {
    const user = await requireUser();
    const workspaces = await listUserWorkspaces(user.id);
    const wanted = (await cookies()).get(WORKSPACE_COOKIE)?.value;
    const workspace = workspaces.find((w) => w.id === wanted) ?? workspaces[0] ?? null;
    return { user, workspaces, workspace };
  },
);

/**
 * Like `requireUser`, plus the active workspace every query is scoped to. A user who belongs to no
 * workspace yet is sent to the page that waits for an invitation.
 */
export async function requireWorkspace(): Promise<WorkspaceContext & { workspaceId: string }> {
  const context = await getWorkspaceContext();
  if (!context.workspace) redirect("/waiting");
  return {
    ...context,
    workspace: context.workspace,
    workspaceId: context.workspace.id,
  };
}
