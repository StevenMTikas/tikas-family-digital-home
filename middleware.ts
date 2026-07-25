// Global authentication gate. Per API_Reference.md: "Every request (except
// login itself) requires an authenticated session." This only proves *someone*
// is logged in (signature-verified from the cookie, no DB lookup) — the
// specific role/scope/permission checks for what that person can actually do
// still happen per-route via lib/core/permissions, per Authorization.md's
// "checked fresh, every time" rule.
//
// Forwards the verified user id as `x-user-id` so pages/routes don't have to
// re-parse the cookie themselves.

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from "@/lib/core/session";

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!api/auth/login|_next/static|_next/image|favicon.ico|login).*)"],
};

export function middleware(req: NextRequest) {
  const userId = verifySessionCookieValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!userId) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Login required." } },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const headers = new Headers(req.headers);
  headers.set("x-user-id", userId);
  return NextResponse.next({ request: { headers } });
}
