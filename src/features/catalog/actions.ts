"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { resolveLocale } from "@/i18n/config";
import { runUserAction } from "@/lib/run-user-action";
import { requireUser } from "@/lib/session";
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
  const user = await requireUser();
  try {
    const locale = resolveLocale(await getLocale());
    const parsed = catalogFormToInput(values, locale);
    if (!parsed.ok) return { ok: false, error: "validation", fieldErrors: parsed.fieldErrors };

    const saved = id
      ? await updateCatalogItem(user.id, id, parsed.input)
      : await createCatalogItem(user.id, parsed.input);
    revalidatePath(PATH);
    return { ok: true, data: { id: saved.id } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function archiveCatalogItemAction(id: string): Promise<ActionResult> {
  return runUserAction(PATH, (userId) => archiveCatalogItem(userId, id));
}

export async function restoreCatalogItemAction(id: string): Promise<ActionResult> {
  return runUserAction(PATH, (userId) => restoreCatalogItem(userId, id));
}
