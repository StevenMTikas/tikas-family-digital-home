// Gmail OAuth start — redirects to Google's consent screen. See
// docs/02_Modules/Email.md and lib/core/email/index.ts's buildGoogleAuthUrl.
// Browser-navigated (a real `<a href>`, not fetch), so failures redirect
// back into the app rather than returning a JSON error.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAuthUser } from "@/lib/core/permissions";
import { isGoogleOAuthConfigured, buildGoogleAuthUrl } from "@/lib/core/email";

// Scoped to this path prefix (not "/"), matched by the callback route below
// it — kept off the rest of the app's cookie space.
const STATE_COOKIE_PATH = "/api/email/oauth/google";
const STATE_COOKIE_NAME = "google_oauth_state";

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return NextResponse.redirect(new URL("/login", req.url));

  if (!isGoogleOAuthConfigured()) {
    return NextResponse.redirect(new URL("/email?error=not_configured", req.url));
  }

  // Computed from the actual incoming request, not hardcoded — works from
  // localhost or a Tailscale hostname as long as both are registered as
  // authorized redirect URIs for this OAuth Client in Google Cloud Console.
  const redirectUri = new URL("/api/email/oauth/google/callback", req.nextUrl.origin).toString();
  const state = randomUUID();

  const res = NextResponse.redirect(buildGoogleAuthUrl(redirectUri, state));
  res.cookies.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600, // just needs to survive the round trip to Google and back
    path: STATE_COOKIE_PATH,
  });
  return res;
}
