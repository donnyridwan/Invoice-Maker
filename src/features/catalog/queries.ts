import { and, asc, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { catalogItems } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";
import { parseInput, UUID_RE } from "@/lib/validate";
import { catalogItemSchema, type CatalogItemInput } from "./schema";

export type CatalogItem = typeof catalogItems.$inferSelect;

function toRow(input: CatalogItemInput) {
  return {
    name: input.name,
    description: input.description ?? null,
    unit: input.unit ?? null,
    unitPriceMinor: input.unitPriceMinor,
    currency: input.currency,
  };
}

function ownedBy(userId: string, id: string) {
  return and(eq(catalogItems.id, id), eq(catalogItems.userId, userId));
}

async function findOwned(userId: string, id: string): Promise<CatalogItem> {
  if (!UUID_RE.test(id)) throw new NotFoundError("Catalog item not found");
  const [row] = await db.select().from(catalogItems).where(ownedBy(userId, id)).limit(1);
  if (!row) throw new NotFoundError("Catalog item not found");
  return row;
}

/** Escapes LIKE wildcards so the search text is matched literally. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

/** Plan 2 uses this (with `search`) for the invoice line-item autocomplete. */
export async function listCatalogItems(
  userId: string,
  { search, includeArchived = false }: { search?: string; includeArchived?: boolean } = {},
): Promise<CatalogItem[]> {
  const term = search?.trim();
  const conditions = [eq(catalogItems.userId, userId)];
  if (!includeArchived) conditions.push(isNull(catalogItems.archivedAt));
  if (term) {
    const pattern = likePattern(term);
    conditions.push(or(ilike(catalogItems.name, pattern), ilike(catalogItems.description, pattern))!);
  }
  return db
    .select()
    .from(catalogItems)
    .where(and(...conditions))
    .orderBy(asc(catalogItems.name), asc(catalogItems.createdAt));
}

export async function getCatalogItem(userId: string, id: string): Promise<CatalogItem> {
  return findOwned(userId, id);
}

export async function createCatalogItem(userId: string, input: unknown): Promise<CatalogItem> {
  const row = toRow(parseInput(catalogItemSchema, input));
  const [created] = await db
    .insert(catalogItems)
    .values({ ...row, userId })
    .returning();
  return created;
}

export async function updateCatalogItem(userId: string, id: string, input: unknown): Promise<CatalogItem> {
  const row = toRow(parseInput(catalogItemSchema, input));
  await findOwned(userId, id);
  const [updated] = await db.update(catalogItems).set(row).where(ownedBy(userId, id)).returning();
  return updated;
}

export async function archiveCatalogItem(userId: string, id: string): Promise<void> {
  await findOwned(userId, id);
  await db.update(catalogItems).set({ archivedAt: new Date() }).where(ownedBy(userId, id));
}

export async function restoreCatalogItem(userId: string, id: string): Promise<void> {
  await findOwned(userId, id);
  await db.update(catalogItems).set({ archivedAt: null }).where(ownedBy(userId, id));
}
