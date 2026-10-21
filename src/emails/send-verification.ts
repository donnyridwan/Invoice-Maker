import { getEmailTransport, fromAddress } from "@/lib/email";
import { getAppUrl } from "@/lib/app-url";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "@/i18n/config";
import { renderVerifyEmail } from "./verify-email";

/** `decodeURIComponent` that returns the raw text for a malformed escape instead of throwing. */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** The UI language of the request that asked for the email (the locale cookie), default id. */
export function localeFromRequest(request?: Request): Locale {
  const cookie = request?.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LOCALE_COOKIE) return resolveLocale(safeDecode(rest.join("=")));
  }
  return resolveLocale(undefined);
}

/**
 * Better Auth builds the link from the request it handled; the email must carry the app's own
 * configured origin instead (never a client-supplied Host header), with the same path and query.
 */
export function rebaseVerificationUrl(url: string, appUrl: string): string {
  const parsed = new URL(url);
  return `${appUrl}${parsed.pathname}${parsed.search}`;
}

/** Better Auth's `sendVerificationEmail`: sends the verify link through the configured transport. */
export async function sendVerificationEmail(
  data: { user: { email: string; name: string }; url: string },
  request?: Request,
): Promise<void> {
  const locale = localeFromRequest(request);
  const { subject, html, text } = await renderVerifyEmail({
    locale,
    name: data.user.name,
    url: rebaseVerificationUrl(data.url, getAppUrl()),
  });
  await getEmailTransport().send({
    from: fromAddress("Invoice Maker"),
    to: [data.user.email],
    subject,
    html,
    text,
  });
}
