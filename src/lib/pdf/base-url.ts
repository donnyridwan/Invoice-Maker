import { cleanUrl, getAppUrl } from "@/lib/app-url";

type Env = Record<string, string | undefined>;

/** `host` or `https://host` as an https origin, or null when empty. */
function httpsOrigin(host: string | undefined): string | null {
  const trimmed = host?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return trimmed ? `https://${trimmed}` : null;
}

/**
 * The origin headless Chromium opens the print page on. On Vercel the function must call its own
 * deployment: production uses `APP_URL` (the public domain) or else the project's production
 * domain; a preview uses its own branch / deployment URL (never the production `APP_URL`, which
 * would be another deployment with another database and secret). Anywhere else (local, tests,
 * `VERCEL_ENV=development`) it is `getAppUrl()`: APP_URL, BETTER_AUTH_URL, localhost.
 */
export function printBaseUrl(env: Env = process.env): string {
  if (env.VERCEL) {
    if (env.VERCEL_ENV === "production") {
      const production = cleanUrl(env.APP_URL) ?? httpsOrigin(env.VERCEL_PROJECT_PRODUCTION_URL);
      if (production) return production;
    } else if (env.VERCEL_ENV === "preview") {
      const preview = httpsOrigin(env.VERCEL_BRANCH_URL || env.VERCEL_URL);
      if (preview) return preview;
    }
  }
  return getAppUrl(undefined, env);
}

/**
 * Header that lets the function's own request through Vercel Deployment Protection, or null when
 * `VERCEL_AUTOMATION_BYPASS_SECRET` is not set. Send it to the app's own origin only.
 */
export function printBypassHeader(env: Env = process.env): Record<string, string> | null {
  const secret = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  return secret ? { "x-vercel-protection-bypass": secret } : null;
}
