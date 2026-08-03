// Gmail OAuth callback — exchanges the code for tokens, connects the
// account (lib/core/email's connectGmailOAuth), and redirects back into the
// app. Identity comes from the normal session (x-user-id, set by
// middleware.ts for any matching request including a plain browser
// redirect landing, not just fetch calls) — `state` is checked purely as a
// CSRF nonce against the cookie the start route set, not for identity.

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/core/permissions";
import { connectGmailOAuth } from "@/lib/core/email";

const STATE_COOKIE_PATH = "/api/email/oauth/google";
const STATE_COOKIE_NAME = "google_oauth_state";

function clearStateCookie(res: NextResponse) {
  res.cookies.set(STATE_COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", maxAge: 0, path: STATE_COOKIE_PATH });
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return NextResponse.redirect(new URL("/login", req.url));

  function fail(reason: string) {
    const res = NextResponse.redirect(new URL(`/email?error=${reason}`, req.url));
    clearStateCookie(res);
    return res;
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(STATE_COOKIE_NAME)?.value;

  if (!code) return fail("oauth_denied"); // Google omits `code` when the user declines consent
  if (!state || !expectedState || state !== expectedState) return fail("oauth_state");

  const redirectUri = new URL("/api/email/oauth/google/callback", req.nextUrl.origin).toString();

  try {
    await connectGmailOAuth(actor.id, redirectUri, code);
  } catch (err) {
    console.error("[email] Gmail OAuth connect failed:", err);
    return fail("oauth_failed");
  }

  const res = NextResponse.redirect(new URL("/email?connected=1", req.url));
  clearStateCookie(res);
  return res;
}
