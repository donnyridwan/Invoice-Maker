import { ZodError } from "zod";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Result of a server action. `error` is a code that the UI translates
 * (`errors.<code>`); `fieldErrors` values are message keys of the `validation`
 * namespace, optionally with a parameter ("tooLong:200").
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

export function toActionError(e: unknown): ActionResult<never> {
  if (e instanceof ValidationError) {
    return { ok: false, error: "validation", fieldErrors: e.fieldErrors };
  }
  if (e instanceof ZodError) {
    return { ok: false, error: "validation", fieldErrors: zodFieldErrors(e) };
  }
  if (e instanceof NotFoundError) {
    return { ok: false, error: "notFound" };
  }
  console.error(e);
  return { ok: false, error: "unknown" };
}

/**
 * Runs a server action and always settles with an `ActionResult`: a rejected call (network
 * failure, request body over the server-action size limit, ...) becomes `{ ok: false, error: "unknown" }`.
 */
export async function settleAction<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (e) {
    console.error(e);
    return { ok: false, error: "unknown" };
  }
}
