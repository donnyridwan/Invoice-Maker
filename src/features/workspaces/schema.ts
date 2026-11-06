import { z } from "zod";
import { requiredEmail, requiredText } from "@/lib/zod-helpers";

export const WORKSPACE_ROLES = ["owner", "member"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const workspaceNameSchema = requiredText(200);

export const memberEmailSchema = z.object({
  email: requiredEmail.transform((email) => email.toLowerCase()),
});
