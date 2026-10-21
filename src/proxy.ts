import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { isAuthPath, isProtectedPath } from "@/lib/routes";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));

  if (isProtectedPath(pathname) && !hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  // `expired=1` marks a cookie the server already rejected; don't redirect it back.
  if (
    isAuthPath(pathname) &&
    hasSession &&
    !request.nextUrl.searchParams.has("expired")
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Lets server components (e.g. the app layout) know which path is being rendered. Set for every
  // page request (see the matcher), which also overwrites any value sent by the client.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

// Next needs a statically analyzable matcher, so this is a literal: every path except API routes,
// Next internals and files with an extension. Which of them need a session is decided by
// `isProtectedPath` (src/lib/routes.ts).
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
