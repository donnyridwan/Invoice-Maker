import { and, asc, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";
import { likePattern } from "@/lib/sql";
import { parseInput, UUID_RE } from "@/lib/validate";
import { clientSchema, type ClientInput } from "./schema";

export type Client = typeof clients.$inferSelect;

function toRow(input: ClientInput) {
  return {
    name: input.name,
    company: input.company ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    address: input.address ?? null,
    country: input.country ?? null,
    defaultCurrency: input.defaultCurrency,
    defaultLanguage: input.defaultLanguage,
    notes: input.notes ?? null,
  };
}

function ownedBy(workspaceId: string, id: string) {
  return and(eq(clients.id, id), eq(clients.workspaceId, workspaceId));
}

async function findOwned(workspaceId: string, id: string): Promise<Client> {
  if (!UUID_RE.test(id)) throw new NotFoundError("Client not found");
  const [row] = await db.select().from(clients).where(ownedBy(workspaceId, id)).limit(1);
  if (!row) throw new NotFoundError("Client not found");
  return row;
}

export async function listClients(
  workspaceId: string,
  { search, includeArchived = false }: { search?: string; includeArchived?: boolean } = {},
): Promise<Client[]> {
  const term = search?.trim();
  const conditions = [eq(clients.workspaceId, workspaceId)];
  if (!includeArchived) conditions.push(isNull(clients.archivedAt));
  if (term) {
    const pattern = likePattern(term);
    conditions.push(or(ilike(clients.name, pattern), ilike(clients.company, pattern), ilike(clients.email, pattern))!);
  }
  return db
    .select()
    .from(clients)
    .where(and(...conditions))
    .orderBy(asc(clients.name), asc(clients.createdAt));
}

export async function getClient(workspaceId: string, id: string): Promise<Client> {
  return findOwned(workspaceId, id);
}

export async function createClient(workspaceId: string, input: unknown): Promise<Client> {
  const row = toRow(parseInput(clientSchema, input));
  const [created] = await db
    .insert(clients)
    .values({ ...row, workspaceId })
    .returning();
  return created;
}

export async function updateClient(workspaceId: string, id: string, input: unknown): Promise<Client> {
  const row = toRow(parseInput(clientSchema, input));
  await findOwned(workspaceId, id);
  const [updated] = await db.update(clients).set(row).where(ownedBy(workspaceId, id)).returning();
  return updated;
}

export async function archiveClient(workspaceId: string, id: string): Promise<void> {
  await findOwned(workspaceId, id);
  await db.update(clients).set({ archivedAt: new Date() }).where(ownedBy(workspaceId, id));
}

export async function restoreClient(workspaceId: string, id: string): Promise<void> {
  await findOwned(workspaceId, id);
  await db.update(clients).set({ archivedAt: null }).where(ownedBy(workspaceId, id));
}
