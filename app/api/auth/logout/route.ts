// Logout API. Not explicitly spec'd in Authentication.md (which only covers
// login/session persistence) — this is the obvious inverse: clear the
// session cookie so the next request hits middleware.ts's redirect-to-login
// path, per Navigation.md's profile-menu "Sign Out" item.

import { NextRequest, NextResponse } from "next/server";
import { logSecurityEvent } from "@/lib/core/logging";
import { SESSION_COOKIE_NAME } from "@/lib/core/session";

export async function POST(req: NextRequest) {
  const userId = req.headers.get("x-user-id");
  if (userId) {
    await logSecurityEvent({ type: "logout", userId });
  }

  const res = NextResponse.json({ signedOut: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
