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
//
// family-view/login and api/family-view/auth/login (2026-08) get the same
// treatment as login/api/auth/login above — the External Viewer login
// surface needs to be reachable without a session cookie too. Once
// authenticated, external_viewer requests pass through this same gate like
// any other role; the family-view-vs-internal route separation itself is
// enforced in app/layout.tsx, not here — see Security_Architecture.md.

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionCookieValue } from "@/lib/core/session";
import { getDb } from "@/db/client";

export const config = {
  runtime: "nodejs",
  // sw.js/manifest.json/icons are public PWA assets (Notifications.md's
  // Android push requirement) — a service worker registration request must
  // never be redirected (the browser spec disallows it outright), same
  // reasoning as favicon.ico already being excluded here.
  matcher: [
    "/((?!api/auth/login|api/family-view/auth/login|api/connectors|_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|icons|login|family-view/login).*)",
  ],
};

// family-view/login and api/family-view/auth/login (2026-08) get the same
// treatment as login/api/auth/login above — the External Viewer login
// surface needs to be reachable without a session cookie too.

function isFamilyViewPath(pathname: string): boolean {
  return pathname.startsWith("/family-view") || pathname.startsWith("/api/family-view");
}

// /api/photos and /api/family-board are called by BOTH the internal app
// (Content, the new internal Board page) and the external surface (the
// external gallery/board) — each route already scopes what it returns per
// role/grant (lib/photos/visibility.ts, app/api/family-board/access.ts), so
// they're deliberately exempt from the blanket external_viewer redirect
// below rather than being treated as "internal-only". /api/auth/logout is
// exempt too — it's role-agnostic (just clears whichever cookie is
// present) and the family-view layout's own Sign Out button calls it, the
// same shared endpoint every internal role uses.
function isSharedApi(pathname: string): boolean {
  return pathname.startsWith("/api/photos") || pathname.startsWith("/api/family-board") || pathname === "/api/auth/logout";
}

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const userId = verifySessionCookieValue(req.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Login required." } },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL(isFamilyViewPath(pathname) ? "/family-view/login" : "/login", req.url));
  }

  // Hard route separation between the internal app and the External Viewer
  // surface (2026-08) — app/layout.tsx's suppression of NavShell/
  // AssistantBubble/NotificationsCenter only hides navigation chrome, it
  // does NOT stop a logged-in external_viewer from directly loading an
  // internal page's real server-rendered content (confirmed live: without
  // this check, /dashboard rendered in full for an external_viewer session).
  // This single role lookup — one column, by primary key — is the actual
  // hard boundary; per-page checks alone proved too easy to miss one.
  const userRow = getDb().prepare(`SELECT role FROM users WHERE id = ?`).get(userId) as { role: string } | undefined;
  const isExternalViewer = userRow?.role === "external_viewer";

  if (isExternalViewer && !isFamilyViewPath(pathname) && !isSharedApi(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Not available for this account." } },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/family-view/photos", req.url));
  }

  if (!isExternalViewer && isFamilyViewPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Not available for this account." } },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const headers = new Headers(req.headers);
  headers.set("x-user-id", userId);
  return NextResponse.next({ request: { headers } });
}
