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

function ownedBy(userId: string, id: string) {
  return and(eq(clients.id, id), eq(clients.userId, userId));
}

async function findOwned(userId: string, id: string): Promise<Client> {
  if (!UUID_RE.test(id)) throw new NotFoundError("Client not found");
  const [row] = await db.select().from(clients).where(ownedBy(userId, id)).limit(1);
  if (!row) throw new NotFoundError("Client not found");
  return row;
}

export async function listClients(
  userId: string,
  { search, includeArchived = false }: { search?: string; includeArchived?: boolean } = {},
): Promise<Client[]> {
  const term = search?.trim();
  const conditions = [eq(clients.userId, userId)];
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

export async function getClient(userId: string, id: string): Promise<Client> {
  return findOwned(userId, id);
}

export async function createClient(userId: string, input: unknown): Promise<Client> {
  const row = toRow(parseInput(clientSchema, input));
  const [created] = await db
    .insert(clients)
    .values({ ...row, userId })
    .returning();
  return created;
}

export async function updateClient(userId: string, id: string, input: unknown): Promise<Client> {
  const row = toRow(parseInput(clientSchema, input));
  await findOwned(userId, id);
  const [updated] = await db.update(clients).set(row).where(ownedBy(userId, id)).returning();
  return updated;
}

export async function archiveClient(userId: string, id: string): Promise<void> {
  await findOwned(userId, id);
  await db.update(clients).set({ archivedAt: new Date() }).where(ownedBy(userId, id));
}

export async function restoreClient(userId: string, id: string): Promise<void> {
  await findOwned(userId, id);
  await db.update(clients).set({ archivedAt: null }).where(ownedBy(userId, id));
}
