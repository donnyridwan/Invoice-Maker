const FALLBACK = "http://localhost:3000";

type HeaderReader = { get(name: string): string | null };

/** `value` as a clean origin-and-path URL (no trailing slash), or null when it is not an http(s) URL. */
function cleanUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return trimmed.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** First entry of a comma separated proxy header ("https, http" -> "https"). */
function first(value: string | null | undefined): string | null {
  const head = value?.split(",")[0]?.trim();
  return head ? head : null;
}

/**
 * The absolute base URL of the app, without a trailing slash: `APP_URL`, else `BETTER_AUTH_URL`,
 * else built from the request headers (`x-forwarded-proto` / `x-forwarded-host`, then `host`).
 * Pass `await headers()` from a server action or route; without headers (and without env) it is
 * the local dev address. Used for every link that leaves the app (share link, email, WhatsApp).
 */
export function getAppUrl(requestHeaders?: HeaderReader): string {
  const fromEnv = cleanUrl(process.env.APP_URL) ?? cleanUrl(process.env.BETTER_AUTH_URL);
  if (fromEnv) return fromEnv;

  const host = first(requestHeaders?.get("x-forwarded-host")) ?? first(requestHeaders?.get("host"));
  if (host) {
    const proto = first(requestHeaders?.get("x-forwarded-proto")) === "https" ? "https" : "http";
    const built = cleanUrl(`${proto}://${host}`);
    if (built) return built;
  }
  return FALLBACK;
}
