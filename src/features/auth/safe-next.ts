const BASE = "http://next.invalid";

/** ASCII control characters (incl. tab/newline, which URL parsers silently strip) and backslashes. */
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\]/;

function decodeOrSelf(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Only allow same-origin relative paths as post-login redirect targets. The value is resolved the
 * way a browser would (`new URL`) and accepted only when it stays on the same origin; the result
 * is rebuilt from pathname + search + hash.
 */
export function safeNextPath(next: string | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/")) return fallback;
  if (UNSAFE_CHARS.test(next) || UNSAFE_CHARS.test(decodeOrSelf(next))) return fallback;
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
