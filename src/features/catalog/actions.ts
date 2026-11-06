"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { resolveLocale } from "@/i18n/config";
import { runWorkspaceAction } from "@/lib/run-workspace-action";
import { requireWorkspace } from "@/lib/workspace";
import { archiveCatalogItem, createCatalogItem, restoreCatalogItem, updateCatalogItem } from "./queries";
import { catalogFormToInput, type CatalogFormValues } from "./schema";

const PATH = "/catalog";

/**
 * Creates (id null) or updates a catalog item. The price arrives as the string the user typed and
 * is parsed with the UI locale; an unparsable price yields `fieldErrors.unitPrice = ['invalidAmount']`.
 */
export async function saveCatalogItemAction(
  id: string | null,
  values: CatalogFormValues,
): Promise<ActionResult<{ id: string }>> {
  const { workspaceId } = await requireWorkspace();
  try {
    const locale = resolveLocale(await getLocale());
    const parsed = catalogFormToInput(values, locale);
    if (!parsed.ok) return { ok: false, error: "validation", fieldErrors: parsed.fieldErrors };

    const saved = id
      ? await updateCatalogItem(workspaceId, id, parsed.input)
      : await createCatalogItem(workspaceId, parsed.input);
    revalidatePath(PATH);
    return { ok: true, data: { id: saved.id } };
  } catch (e) {
    return toActionError(e);
  }
}

/**
 * "Save to catalog" from an invoice line: the values are already parsed (minor units), so they go
 * straight to the zod schema. Field errors use the schema's keys (`name`, `unitPriceMinor`, ...).
 */
export async function saveItemToCatalogAction(input: {
  name: string;
  description: string;
  unit: string;
  unitPriceMinor: number;
  currency: string;
}): Promise<ActionResult<{ id: string }>> {
  const { workspaceId } = await requireWorkspace();
  try {
    const created = await createCatalogItem(workspaceId, input);
    revalidatePath(PATH);
    return { ok: true, data: { id: created.id } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function archiveCatalogItemAction(id: string): Promise<ActionResult> {
  return runWorkspaceAction(PATH, (workspaceId) => archiveCatalogItem(workspaceId, id));
}

export async function restoreCatalogItemAction(id: string): Promise<ActionResult> {
  return runWorkspaceAction(PATH, (workspaceId) => restoreCatalogItem(workspaceId, id));
}
