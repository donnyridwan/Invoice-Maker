type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Translates a validation message key produced by the zod schemas
 * ("required", "tooLong:200") using the `validation` namespace.
 */
export function translateValidation(t: Translate, message: string): string {
  const [key, param] = message.split(":");
  return t(`validation.${key}`, param ? { max: param, min: param } : undefined);
}

/**
 * The message for a failed action result: the first validation message when there is one
 * (form-level first), else the `errors.<code>` text.
 */
export function actionErrorMessage(
  t: Translate,
  result: { error: string; fieldErrors?: Record<string, string[]> },
): string {
  const fields = result.fieldErrors ?? {};
  const first = fields._form?.[0] ?? Object.values(fields)[0]?.[0];
  return first ? translateValidation(t, first) : t(`errors.${result.error}`);
}
