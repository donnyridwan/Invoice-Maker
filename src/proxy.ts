import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/settings", "/clients", "/catalog"];
const AUTH_PATHS = ["/login", "/register"];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));

  if (PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix)) && !hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // `expired=1` marks a cookie the server already rejected; don't redirect it back.
  if (
    AUTH_PATHS.includes(pathname) &&
    hasSession &&
    !request.nextUrl.searchParams.has("expired")
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/settings/:path*",
    "/clients/:path*",
    "/catalog/:path*",
    "/login",
    "/register",
  ],
};
