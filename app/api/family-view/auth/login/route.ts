// External Viewer login API — the only login route reachable from the open
// internet (via the path-scoped Tailscale Funnel, see
// Security_Architecture.md). Near-clone of app/api/auth/login/route.ts, with
// two differences that matter specifically because this route is publicly
// reachable: a failed-login lockout (lib/core/auth/throttle.ts — the
// internal /login route deliberately has none, per Authentication.md), and a
// finite 30-day session TTL instead of the indefinite one every internal
// role gets.

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/db/client";
import { logSecurityEvent } from "@/lib/core/logging";
import { createSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/core/session";
import { checkLoginThrottle } from "@/lib/core/auth/throttle";

const EXTERNAL_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  full_name: string;
  role: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!username || !password) {
    return errorResponse("INVALID_INPUT", "Username and password are required.", 400);
  }

  const db = getDb();

  const throttle = checkLoginThrottle(db, username);
  if (throttle.locked) {
    await logSecurityEvent({ type: "login_locked", userId: "", detail: { username, surface: "external" } });
    return errorResponse(
      "TOO_MANY_ATTEMPTS",
      "Too many failed attempts. Try again later.",
      429
    );
  }

  const user = db
    .prepare("SELECT id, username, password_hash, full_name, role FROM users WHERE username = ?")
    .get(username) as UserRow | undefined;

  // Checked after the password compare and folded into the same generic
  // response as a wrong password — a family member's real credentials must
  // never authenticate on this publicly-reachable surface, but there's no
  // observable difference between "wrong password" and "right password,
  // wrong role" from the outside.
  const passwordOk = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !passwordOk || user.role !== "external_viewer") {
    await logSecurityEvent({
      type: "login_failed",
      userId: user?.id ?? "",
      detail: { username, surface: "external" },
    });
    return errorResponse("INVALID_CREDENTIALS", "Incorrect username or password.", 401);
  }

  await logSecurityEvent({ type: "login", userId: user.id, detail: { surface: "external" } });

  const res = NextResponse.json({
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
  });

  const expiresAtEpochMs = Date.now() + EXTERNAL_SESSION_TTL_MS;
  res.cookies.set(SESSION_COOKIE_NAME, createSessionCookieValue(user.id, expiresAtEpochMs), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: EXTERNAL_SESSION_TTL_MS / 1000,
  });

  return res;
}
