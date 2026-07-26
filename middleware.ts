// Global authentication gate. Per API_Reference.md: "Every request (except
// login itself) requires an authenticated session." This only proves *someone*
// is logged in (signature-verified from the cookie, no DB lookup) — the
// specific role/scope/permission checks for what that person can actually do
// still happen per-route via lib/core/permissions, per Authorization.md's
// "checked fresh, every time" rule.
//
// Forwards the verified user id as `x-user-id` so pages/routes don't have to
// re-parse the cookie themselves.
//
// api/connectors is also excluded: connectors (File_Connector_Architecture.md)
// aren't a logged-in family member and carry no session cookie — they
// authenticate with their own device id + auth_token instead, checked inside
// each connector route via lib/core/connectors.

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from "@/lib/core/session";

export const config = {
  runtime: "nodejs",
  // sw.js/manifest.json/icons are public PWA assets (Notifications.md's
  // Android push requirement) — a service worker registration request must
  // never be redirected (the browser spec disallows it outright), same
  // reasoning as favicon.ico already being excluded here.
  matcher: [
    "/((?!api/auth/login|api/connectors|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|icons|login).*)",
  ],
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
