"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { runUserAction } from "@/lib/run-user-action";
import { requireUser } from "@/lib/session";
import { archiveClient, createClient, restoreClient, updateClient } from "./queries";

const PATH = "/clients";

/** Creates (id null) or updates a client. `input` is validated by the zod schema. */
export async function saveClientAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  try {
    const saved = id ? await updateClient(user.id, id, input) : await createClient(user.id, input);
    revalidatePath(PATH);
    return { ok: true, data: { id: saved.id } };
  } catch (e) {
    return toActionError(e);
  }
}

export type InlineClientValues = {
  name: string;
  email: string;
  company: string;
  defaultCurrency: string;
  defaultLanguage: string;
};

export type InlineClient = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  defaultCurrency: string | null;
  defaultLanguage: string | null;
};

/** Quick "new client" from the invoice editor: the short form, returning what the editor needs. */
export async function createClientInlineAction(values: InlineClientValues): Promise<ActionResult<InlineClient>> {
  const user = await requireUser();
  try {
    const created = await createClient(user.id, values);
    revalidatePath(PATH);
    return {
      ok: true,
      data: {
        id: created.id,
        name: created.name,
        company: created.company,
        email: created.email,
        phone: created.phone,
        address: created.address,
        country: created.country,
        defaultCurrency: created.defaultCurrency,
        defaultLanguage: created.defaultLanguage,
      },
    };
  } catch (e) {
    return toActionError(e);
  }
}

export async function archiveClientAction(id: string): Promise<ActionResult> {
  return runUserAction(PATH, (userId) => archiveClient(userId, id));
}

export async function restoreClientAction(id: string): Promise<ActionResult> {
  return runUserAction(PATH, (userId) => restoreClient(userId, id));
}
