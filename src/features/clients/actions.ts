"use server";

import { revalidatePath } from "next/cache";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { runWorkspaceAction } from "@/lib/run-workspace-action";
import { requireWorkspace } from "@/lib/workspace";
import { archiveClient, createClient, restoreClient, updateClient } from "./queries";

const PATH = "/clients";

/** Creates (id null) or updates a client. `input` is validated by the zod schema. */
export async function saveClientAction(id: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  const { workspaceId } = await requireWorkspace();
  try {
    const saved = id ? await updateClient(workspaceId, id, input) : await createClient(workspaceId, input);
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
  const { workspaceId } = await requireWorkspace();
  try {
    const created = await createClient(workspaceId, values);
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
  return runWorkspaceAction(PATH, (workspaceId) => archiveClient(workspaceId, id));
}

export async function restoreClientAction(id: string): Promise<ActionResult> {
  return runWorkspaceAction(PATH, (workspaceId) => restoreClient(workspaceId, id));
}
