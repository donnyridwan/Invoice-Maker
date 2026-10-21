import type { ZodType } from "zod";
import { ValidationError } from "@/lib/errors";
import { zodFieldErrors } from "@/lib/action-result";

/** Parses `input` with `schema`, throwing a ValidationError with per-field message keys. */
export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(zodFieldErrors(result.error));
  }
  return result.data;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
