/**
 * Single source of truth for which paths need a session. Used by the proxy (auth redirect) and,
 * through the `x-pathname` header the proxy sets on every page request, by the (app) layout's
 * onboarding gate. Adding a top-level app route (e.g. "/invoices") only needs an entry here.
 */
export const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/settings", "/clients", "/catalog"] as const;

/** Pages that signed-in users are sent away from. */
export const AUTH_PATHS = ["/login", "/register"] as const;

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isAuthPath(pathname: string): boolean {
  return (AUTH_PATHS as readonly string[]).includes(pathname);
}
