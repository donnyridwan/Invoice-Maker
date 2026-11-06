import { and, asc, eq, ilike, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { catalogItems } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";
import { likePattern } from "@/lib/sql";
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

function ownedBy(workspaceId: string, id: string) {
  return and(eq(catalogItems.id, id), eq(catalogItems.workspaceId, workspaceId));
}

async function findOwned(workspaceId: string, id: string): Promise<CatalogItem> {
  if (!UUID_RE.test(id)) throw new NotFoundError("Catalog item not found");
  const [row] = await db.select().from(catalogItems).where(ownedBy(workspaceId, id)).limit(1);
  if (!row) throw new NotFoundError("Catalog item not found");
  return row;
}

/** Plan 2 uses this (with `search`) for the invoice line-item autocomplete. */
export async function listCatalogItems(
  workspaceId: string,
  { search, includeArchived = false }: { search?: string; includeArchived?: boolean } = {},
): Promise<CatalogItem[]> {
  const term = search?.trim();
  const conditions = [eq(catalogItems.workspaceId, workspaceId)];
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

export async function getCatalogItem(workspaceId: string, id: string): Promise<CatalogItem> {
  return findOwned(workspaceId, id);
}

export async function createCatalogItem(workspaceId: string, input: unknown): Promise<CatalogItem> {
  const row = toRow(parseInput(catalogItemSchema, input));
  const [created] = await db
    .insert(catalogItems)
    .values({ ...row, workspaceId })
    .returning();
  return created;
}

export async function updateCatalogItem(workspaceId: string, id: string, input: unknown): Promise<CatalogItem> {
  const row = toRow(parseInput(catalogItemSchema, input));
  await findOwned(workspaceId, id);
  const [updated] = await db.update(catalogItems).set(row).where(ownedBy(workspaceId, id)).returning();
  return updated;
}

export async function archiveCatalogItem(workspaceId: string, id: string): Promise<void> {
  await findOwned(workspaceId, id);
  await db.update(catalogItems).set({ archivedAt: new Date() }).where(ownedBy(workspaceId, id));
}

export async function restoreCatalogItem(workspaceId: string, id: string): Promise<void> {
  await findOwned(workspaceId, id);
  await db.update(catalogItems).set({ archivedAt: null }).where(ownedBy(workspaceId, id));
}
