/** Only allow same-origin relative paths as post-login redirect targets. */
export function safeNextPath(next: string | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
