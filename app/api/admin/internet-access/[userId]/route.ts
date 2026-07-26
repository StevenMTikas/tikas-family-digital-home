// Revokes an outside-call-related permission from a user, directly from the
// Internet Access screen. See docs/06_Admin/Internet_Access.md: "a direct
// revoke action" — same underlying User permission fields Authorization.md
// defines, just a faster entry point than a general permission editor.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { logSecurityEvent } from "@/lib/core/logging";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const REVOCABLE_FIELDS: Record<string, string> = {
  approveOutsideCalls: "approve_outside_calls",
  approveSensitiveOutsideTransmission: "approve_sensitive_outside_transmission",
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);
  if (actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can revoke this permission.", 403);
  }

  const body = await req.json().catch(() => null);
  const permission = typeof body?.permission === "string" ? body.permission : "";
  const column = REVOCABLE_FIELDS[permission];
  if (!column) {
    return errorResponse("INVALID_INPUT", "permission must be approveOutsideCalls or approveSensitiveOutsideTransmission.", 400);
  }

  const db = getDb();
  const target = db.prepare(`SELECT full_name FROM users WHERE id = ?`).get(userId) as { full_name: string } | undefined;
  if (!target) return errorResponse("NOT_FOUND", "No such user.", 404);

  db.prepare(`UPDATE users SET ${column} = 0 WHERE id = ?`).run(userId);

  await logSecurityEvent({
    type: "permission_changed",
    userId: actor.id,
    detail: { action: "revoked", permission, targetUserId: userId, targetUserName: target.full_name },
  });

  return NextResponse.json({ userId, permission, revoked: true });
}
