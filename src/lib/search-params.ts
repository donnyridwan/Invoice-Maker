/** First value of a Next `searchParams` entry (which may be a string, an array or missing). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
