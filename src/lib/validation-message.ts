type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Translates a validation message key produced by the zod schemas
 * ("required", "tooLong:200") using the `validation` namespace.
 */
export function translateValidation(t: Translate, message: string): string {
  const [key, param] = message.split(":");
  return t(`validation.${key}`, param ? { max: param, min: param } : undefined);
}
