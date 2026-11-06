import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { businessProfiles, clients, invoices, user, workspaceMembers } from "@/db/schema";
import { createClient, getClient, listClients } from "@/features/clients/queries";
import { recordPublicView } from "@/features/invoices/lifecycle";
import { createDraftInvoice, getInvoice } from "@/features/invoices/queries";
import { ensureProfile } from "@/features/profile/queries";
import {
  addMemberByEmail,
  createWorkspace,
  deleteWorkspace,
  getRole,
  listMembers,
  listUserWorkspaces,
  removeMember,
  setMemberRole,
  verifiedMemberEmails,
} from "@/features/workspaces/queries";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { createTestUser, resetDb, testDb } from "./helpers";

async function fieldErrors(promise: Promise<unknown>): Promise<Record<string, string[]>> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ValidationError);
  return (error as ValidationError).fieldErrors;
}

/** An owner with a business of their own, and a registered account that belongs to no workspace. */
async function ownerAndNewcomer() {
  const owner = await createTestUser({ name: "Donny" });
  const newcomer = await createTestUser({ name: "Rina", email: "rina@finance.test", workspace: false });
  return { owner, newcomer };
}

describe("workspaces", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("creates a workspace owned by its creator, with a business profile named after it", async () => {
    const u = await createTestUser({ workspace: false });
    const { id } = await createWorkspace(u.id, { name: "  Toko Kopi  ", email: u.email });

    expect(await getRole(u.id, id)).toBe("owner");
    const [profile] = await testDb.select().from(businessProfiles).where(eq(businessProfiles.workspaceId, id));
    expect(profile).toMatchObject({ businessName: "Toko Kopi", email: u.email, onboardingCompletedAt: null });
    expect(await listUserWorkspaces(u.id)).toEqual([{ id, name: "Toko Kopi", role: "owner", logoUrl: null }]);
  });

  it("rejects a blank business name", async () => {
    const u = await createTestUser({ workspace: false });
    expect(await fieldErrors(createWorkspace(u.id, { name: "  ", email: u.email }))).toEqual({ _form: ["required"] });
  });

  it("lists only the workspaces the user belongs to, named after their business", async () => {
    const { owner, newcomer } = await ownerAndNewcomer();
    const other = await createTestUser();
    await ensureProfile(owner.id, { businessName: "Studio Donny", email: owner.email });

    expect(await listUserWorkspaces(newcomer.id)).toEqual([]);
    await addMemberByEmail(owner.id, owner.id, { email: newcomer.email });
    const list = await listUserWorkspaces(newcomer.id);
    expect(list).toEqual([{ id: owner.id, name: "Studio Donny", role: "member", logoUrl: null }]);
    expect(list.map((w) => w.id)).not.toContain(other.id);
    expect(await getRole(newcomer.id, other.id)).toBeNull();
  });

  describe("members", () => {
    it("adds a registered account by email, ignoring case and spaces", async () => {
      const { owner, newcomer } = await ownerAndNewcomer();
      const added = await addMemberByEmail(owner.id, owner.id, { email: "  RINA@Finance.test " });

      expect(added).toMatchObject({ userId: newcomer.id, name: "Rina", email: "rina@finance.test", role: "member" });
      expect((await listMembers(owner.id)).map((m) => [m.name, m.role])).toEqual([
        ["Donny", "owner"],
        ["Rina", "member"],
      ]);
    });

    it("refuses an email nobody signed up with, a current member and an invalid address", async () => {
      const { owner, newcomer } = await ownerAndNewcomer();
      expect(await fieldErrors(addMemberByEmail(owner.id, owner.id, { email: "nobody@x.test" }))).toEqual({
        email: ["notRegistered"],
      });
      await addMemberByEmail(owner.id, owner.id, { email: newcomer.email });
      expect(await fieldErrors(addMemberByEmail(owner.id, owner.id, { email: newcomer.email }))).toEqual({
        email: ["alreadyMember"],
      });
      expect(await fieldErrors(addMemberByEmail(owner.id, owner.id, { email: "bukan-email" }))).toEqual({
        email: ["invalidEmail"],
      });
    });

    it("lets only owners manage the team; an outsider does not even see the workspace", async () => {
      const { owner, newcomer } = await ownerAndNewcomer();
      const outsider = await createTestUser();
      const third = await createTestUser({ email: "third@x.test", workspace: false });
      await addMemberByEmail(owner.id, owner.id, { email: newcomer.email });

      expect(await fieldErrors(addMemberByEmail(newcomer.id, owner.id, { email: third.email }))).toEqual({
        _form: ["ownerOnly"],
      });
      expect(await fieldErrors(removeMember(newcomer.id, owner.id, owner.id))).toEqual({ _form: ["ownerOnly"] });
      expect(await fieldErrors(setMemberRole(newcomer.id, owner.id, newcomer.id, "owner"))).toEqual({
        _form: ["ownerOnly"],
      });
      expect(await fieldErrors(deleteWorkspace(newcomer.id, owner.id, "Donny"))).toEqual({ _form: ["ownerOnly"] });
      await expect(addMemberByEmail(outsider.id, owner.id, { email: third.email })).rejects.toBeInstanceOf(NotFoundError);
    });

    it("changes roles and removes members, but never leaves a workspace without an owner", async () => {
      const { owner, newcomer } = await ownerAndNewcomer();
      await addMemberByEmail(owner.id, owner.id, { email: newcomer.email });

      expect(await fieldErrors(setMemberRole(owner.id, owner.id, owner.id, "member"))).toEqual({ _form: ["lastOwner"] });
      expect(await fieldErrors(removeMember(owner.id, owner.id, owner.id))).toEqual({ _form: ["lastOwner"] });

      await setMemberRole(owner.id, owner.id, newcomer.id, "owner");
      expect(await getRole(newcomer.id, owner.id)).toBe("owner");
      // With a second owner, the first may step down, or leave.
      await removeMember(owner.id, owner.id, owner.id);
      expect(await getRole(owner.id, owner.id)).toBeNull();
      expect(await fieldErrors(removeMember(newcomer.id, owner.id, newcomer.id))).toEqual({ _form: ["lastOwner"] });
      await expect(removeMember(newcomer.id, owner.id, owner.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    it("keeps the invoices a removed member created", async () => {
      const { owner, newcomer } = await ownerAndNewcomer();
      await ensureProfile(owner.id, { businessName: "Studio Donny", email: owner.email });
      await addMemberByEmail(owner.id, owner.id, { email: newcomer.email });
      const draft = await createDraftInvoice(owner.id, { createdBy: newcomer.id });
      expect(draft.createdBy).toBe(newcomer.id);

      await removeMember(owner.id, owner.id, newcomer.id);
      expect((await getInvoice(owner.id, draft.id)).createdBy).toBe(newcomer.id);
      await testDb.delete(user).where(eq(user.id, newcomer.id));
      expect((await getInvoice(owner.id, draft.id)).createdBy).toBeNull();
    });

    it("emails notifications only to members whose email is verified", async () => {
      const { owner, newcomer } = await ownerAndNewcomer();
      await addMemberByEmail(owner.id, owner.id, { email: newcomer.email });
      expect(await verifiedMemberEmails(owner.id)).toEqual([]);
      await testDb.update(user).set({ emailVerified: true }).where(eq(user.id, newcomer.id));
      expect(await verifiedMemberEmails(owner.id)).toEqual(["rina@finance.test"]);
    });
  });

  describe("isolation", () => {
    it("keeps each workspace's data to itself, whoever is a member of both", async () => {
      const a = await createTestUser({ name: "Bisnis A" });
      const b = await createTestUser({ name: "Bisnis B" });
      const finance = await createTestUser({ email: "fin@a.test", workspace: false });
      await addMemberByEmail(a.id, a.id, { email: finance.email });
      const clientOfB = await createClient(b.id, { name: "Klien B", defaultCurrency: "IDR" });
      await createClient(a.id, { name: "Klien A", defaultCurrency: "IDR" });

      expect((await listClients(a.id)).map((c) => c.name)).toEqual(["Klien A"]);
      await expect(getClient(a.id, clientOfB.id)).rejects.toBeInstanceOf(NotFoundError);
      expect(await getRole(finance.id, b.id)).toBeNull();
    });

    it("does not count a member opening the public link as the client viewing it", async () => {
      const { owner, newcomer } = await ownerAndNewcomer();
      await ensureProfile(owner.id, { businessName: "Studio Donny", email: owner.email });
      await addMemberByEmail(owner.id, owner.id, { email: newcomer.email });
      const draft = await createDraftInvoice(owner.id);
      await testDb.update(invoices).set({ status: "sent" }).where(eq(invoices.id, draft.id));

      await recordPublicView(draft.publicToken, newcomer.id);
      expect((await getInvoice(owner.id, draft.id)).firstViewedAt).toBeNull();
      const stranger = await createTestUser();
      await recordPublicView(draft.publicToken, stranger.id);
      expect((await getInvoice(owner.id, draft.id)).firstViewedAt).not.toBeNull();
    });
  });

  describe("deleting", () => {
    it("deletes the workspace with its data once the owner repeats its name", async () => {
      const { owner, newcomer } = await ownerAndNewcomer();
      await ensureProfile(owner.id, { businessName: "Studio Donny", email: owner.email });
      await addMemberByEmail(owner.id, owner.id, { email: newcomer.email });
      await createClient(owner.id, { name: "Klien", defaultCurrency: "IDR" });

      expect(await fieldErrors(deleteWorkspace(owner.id, owner.id, "Studio"))).toEqual({ confirmName: ["nameMismatch"] });
      await deleteWorkspace(owner.id, owner.id, " Studio Donny ");

      expect(await testDb.select().from(clients)).toHaveLength(0);
      expect(await testDb.select().from(workspaceMembers)).toHaveLength(0);
      expect(await listUserWorkspaces(newcomer.id)).toEqual([]);
      // The accounts themselves stay.
      expect(await testDb.select().from(user)).toHaveLength(2);
    });
  });
});
