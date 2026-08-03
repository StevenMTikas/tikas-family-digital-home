// Login API. See docs/04_Permissions/Authentication.md: username/password
// login, no lockouts, no self-service recovery, indefinite session on success.

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/db/client";
import { logSecurityEvent } from "@/lib/core/logging";
import { createSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/core/session";

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
  const user = db
    .prepare("SELECT id, username, password_hash, full_name, role FROM users WHERE username = ?")
    .get(username) as UserRow | undefined;

  // external_viewer accounts only ever authenticate through the separate
  // /family-view login surface (app/api/family-view/auth/login) — refused
  // here the same generic way as a wrong password, so there's no
  // "valid password, wrong surface" side-channel. Keeps the two account
  // universes symmetric even if an external_viewer's credentials leaked.
  const passwordOk = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !passwordOk || user.role === "external_viewer") {
    await logSecurityEvent({
      type: "login_failed",
      userId: user?.id ?? "",
      detail: { username },
    });
    return errorResponse("INVALID_CREDENTIALS", "Incorrect username or password.", 401);
  }

  await logSecurityEvent({ type: "login", userId: user.id });

  const res = NextResponse.json({
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
  });

  res.cookies.set(SESSION_COOKIE_NAME, createSessionCookieValue(user.id), {
    httpOnly: true,
    sameSite: "lax",
    // No `expires`/`maxAge` — indefinite session on a trusted device, per Authentication.md.
    path: "/",
  });

  return res;
}
