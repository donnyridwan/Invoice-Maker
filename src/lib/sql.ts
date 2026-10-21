/** Escapes LIKE/ILIKE wildcards so user-typed search text is matched literally. */
export function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}
