"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { UUID_RE } from "@/lib/validate";
import { requireWorkspace, WORKSPACE_COOKIE } from "@/lib/workspace";
import { addMemberByEmail, createWorkspace, deleteWorkspace, getRole, removeMember, setMemberRole } from "./queries";
import { WORKSPACE_ROLES, type WorkspaceRole } from "./schema";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const TEAM_PATH = "/settings/team";

async function setActiveWorkspace(id: string | null): Promise<void> {
  const store = await cookies();
  if (id === null) {
    store.delete(WORKSPACE_COOKIE);
    return;
  }
  store.set(WORKSPACE_COOKIE, id, {
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
}

/** Makes `id` the active workspace, if the user belongs to it. */
export async function switchWorkspaceAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    if (!UUID_RE.test(id) || !(await getRole(user.id, id))) throw new NotFoundError("Workspace not found");
    await setActiveWorkspace(id);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

/** A new business owned by the user, made active; its onboarding comes next. */
export async function createWorkspaceAction(name: string): Promise<ActionResult<{ redirectTo: string }>> {
  const user = await requireUser();
  try {
    const { id } = await createWorkspace(user.id, { name, email: user.email });
    await setActiveWorkspace(id);
    revalidatePath("/", "layout");
    return { ok: true, data: { redirectTo: "/onboarding" } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function addMemberAction(input: { email: string }): Promise<ActionResult> {
  const { user, workspaceId } = await requireWorkspace();
  try {
    await addMemberByEmail(user.id, workspaceId, input);
    revalidatePath(TEAM_PATH);
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeMemberAction(memberId: string): Promise<ActionResult> {
  const { user, workspaceId } = await requireWorkspace();
  try {
    await removeMember(user.id, workspaceId, memberId);
    // Removing yourself also takes the workspace out of your switcher.
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setMemberRoleAction(memberId: string, role: WorkspaceRole): Promise<ActionResult> {
  const { user, workspaceId } = await requireWorkspace();
  try {
    if (!(WORKSPACE_ROLES as readonly string[]).includes(role)) throw new NotFoundError("Unknown role");
    await setMemberRole(user.id, workspaceId, memberId, role);
    revalidatePath(TEAM_PATH);
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

/** Deletes the active workspace with all its data; the user moves on to another one (or none). */
export async function deleteWorkspaceAction(confirmName: string): Promise<ActionResult> {
  const { user, workspaceId } = await requireWorkspace();
  try {
    await deleteWorkspace(user.id, workspaceId, confirmName);
    await setActiveWorkspace(null);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}
