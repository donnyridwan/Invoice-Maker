import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, user, workspaceMembers, workspaces } from "@/db/schema";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseInput } from "@/lib/validate";
import { memberEmailSchema, workspaceNameSchema, type WorkspaceRole } from "./schema";

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: WorkspaceRole;
  logoUrl: string | null;
};

export type WorkspaceMember = {
  userId: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  joinedAt: Date;
};

/** The workspaces `userId` belongs to, oldest membership first, named after their business. */
export async function listUserWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      businessName: businessProfiles.businessName,
      role: workspaceMembers.role,
      logoUrl: businessProfiles.logoUrl,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .leftJoin(businessProfiles, eq(businessProfiles.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaceMembers.createdAt), asc(workspaces.name));
  return rows.map(({ businessName, ...row }) => ({
    ...row,
    name: businessName?.trim() || row.name,
  }));
}

/** The email addresses of the workspace's members whose email is verified (who may get notifications). */
export async function verifiedMemberEmails(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ email: user.email })
    .from(workspaceMembers)
    .innerJoin(user, eq(user.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(user.emailVerified, true)))
    .orderBy(asc(workspaceMembers.createdAt));
  return rows.map((r) => r.email);
}

/** The role of `userId` in `workspaceId`, or null when they are not a member. */
export async function getRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1);
  return row?.role ?? null;
}

/** A new workspace owned by `userId`, with its business profile (onboarding still to do). */
export async function createWorkspace(
  userId: string,
  input: { name: unknown; email: string },
): Promise<{ id: string }> {
  const name = parseInput(workspaceNameSchema, input.name);
  return db.transaction(async (tx) => {
    const [workspace] = await tx.insert(workspaces).values({ name }).returning({ id: workspaces.id });
    await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId, role: "owner" });
    await tx.insert(businessProfiles).values({
      workspaceId: workspace.id,
      businessName: name,
      email: input.email,
    });
    return workspace;
  });
}

export async function listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  return db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(user, eq(user.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(workspaceMembers.createdAt), asc(user.name));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Locks the workspace row (so concurrent member changes queue up behind each other) and checks
 * that `actorId` owns it. Someone outside the workspace gets NotFound, a member `ownerOnly`.
 */
async function lockAsOwner(tx: Tx, actorId: string, workspaceId: string): Promise<void> {
  const [locked] = await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .for("update")
    .limit(1);
  if (!locked) throw new NotFoundError("Workspace not found");
  const [actor] = await tx
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actorId)))
    .limit(1);
  if (!actor) throw new NotFoundError("Workspace not found");
  if (actor.role !== "owner") throw new ValidationError({ _form: ["ownerOnly"] });
}

async function ownerCount(tx: Tx, workspaceId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner")));
  return row.n;
}

/** Adds the account registered under `email` as a member. It must exist and not be a member yet. */
export async function addMemberByEmail(actorId: string, workspaceId: string, input: unknown): Promise<WorkspaceMember> {
  const { email } = parseInput(memberEmailSchema, input);
  return db.transaction(async (tx) => {
    await lockAsOwner(tx, actorId, workspaceId);
    const [account] = await tx
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(sql`lower(${user.email}) = ${email}`)
      .limit(1);
    if (!account) throw new ValidationError({ email: ["notRegistered"] });
    const [added] = await tx
      .insert(workspaceMembers)
      .values({ workspaceId, userId: account.id, role: "member" })
      .onConflictDoNothing()
      .returning({
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.createdAt,
      });
    if (!added) throw new ValidationError({ email: ["alreadyMember"] });
    return {
      userId: account.id,
      name: account.name,
      email: account.email,
      ...added,
    };
  });
}

/** Removes a member (an owner may remove themselves) but never the last owner. */
export async function removeMember(actorId: string, workspaceId: string, memberId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockAsOwner(tx, actorId, workspaceId);
    const role = await memberRole(tx, workspaceId, memberId);
    if (role === "owner" && (await ownerCount(tx, workspaceId)) <= 1) {
      throw new ValidationError({ _form: ["lastOwner"] });
    }
    await tx
      .delete(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, memberId)));
  });
}

export async function setMemberRole(
  actorId: string,
  workspaceId: string,
  memberId: string,
  role: WorkspaceRole,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockAsOwner(tx, actorId, workspaceId);
    const current = await memberRole(tx, workspaceId, memberId);
    if (current === role) return;
    if (current === "owner" && (await ownerCount(tx, workspaceId)) <= 1) {
      throw new ValidationError({ _form: ["lastOwner"] });
    }
    await tx
      .update(workspaceMembers)
      .set({ role })
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, memberId)));
  });
}

async function memberRole(tx: Tx, workspaceId: string, memberId: string): Promise<WorkspaceRole> {
  const [row] = await tx
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, memberId)))
    .limit(1);
  if (!row) throw new NotFoundError("Member not found");
  return row.role;
}

/**
 * Deletes the workspace and, through the foreign keys, all of its data. `confirmName` must repeat
 * the business name shown to the owner, as a guard against deleting the wrong one.
 */
export async function deleteWorkspace(actorId: string, workspaceId: string, confirmName: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockAsOwner(tx, actorId, workspaceId);
    const [row] = await tx
      .select({
        name: workspaces.name,
        businessName: businessProfiles.businessName,
      })
      .from(workspaces)
      .leftJoin(businessProfiles, eq(businessProfiles.workspaceId, workspaces.id))
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    const name = row.businessName?.trim() || row.name;
    if (confirmName.trim() !== name) throw new ValidationError({ confirmName: ["nameMismatch"] });
    await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));
  });
}
