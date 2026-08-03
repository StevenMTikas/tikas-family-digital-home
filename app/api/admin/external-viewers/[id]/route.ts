// Single External Viewer account API — Super-Admin-only, per
// Authorization.md (role/account lifecycle for this type isn't an
// individually grantable permission, same reasoning as regular Add User).

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { logSecurityEvent } from "@/lib/core/logging";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface ExternalViewerRow {
  id: string;
  role: string;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can manage External Viewers.", 403);
  }

  const db = getDb();
  const row = db.prepare(`SELECT id, role FROM users WHERE id = ?`).get(id) as ExternalViewerRow | undefined;
  if (!row || row.role !== "external_viewer") return errorResponse("NOT_FOUND", "No such External Viewer.", 404);

  const body = await req.json().catch(() => null);
  const updates: Record<string, unknown> = {};
  const logDetail: Record<string, unknown> = { scope: "external_viewer", action: "updated", externalViewerId: id };

  if (typeof body?.boardAccess === "boolean") {
    updates.view_family_board = body.boardAccess ? 1 : 0;
    logDetail.boardAccess = body.boardAccess;
  }
  if (typeof body?.fullName === "string" && body.fullName.trim()) {
    updates.full_name = body.fullName.trim();
  }
  if (typeof body?.newPassword === "string" && body.newPassword) {
    updates.password_hash = bcrypt.hashSync(body.newPassword, 10);
    logDetail.passwordReset = true;
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse("INVALID_INPUT", "No changes provided.", 400);
  }

  const setClause = Object.keys(updates).map((f) => `${f} = @${f}`).join(", ");
  db.prepare(`UPDATE users SET ${setClause} WHERE id = @id`).run({ ...updates, id });
  await logSecurityEvent({ type: "permission_changed", userId: actor.id, detail: logDetail });

  const updated = db
    .prepare(`SELECT id, username, full_name, view_family_board, created_at FROM users WHERE id = ?`)
    .get(id) as { id: string; username: string; full_name: string; view_family_board: number; created_at: string };

  return NextResponse.json({
    id: updated.id,
    username: updated.username,
    fullName: updated.full_name,
    boardAccess: !!updated.view_family_board,
    createdAt: updated.created_at,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only the Super Admin can manage External Viewers.", 403);
  }

  const db = getDb();
  const row = db.prepare(`SELECT id, role FROM users WHERE id = ?`).get(id) as ExternalViewerRow | undefined;
  if (!row || row.role !== "external_viewer") return errorResponse("NOT_FOUND", "No such External Viewer.", 404);

  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  await logSecurityEvent({
    type: "permission_changed",
    userId: actor.id,
    detail: { scope: "external_viewer", action: "deleted", externalViewerId: id },
  });

  return new NextResponse(null, { status: 204 });
}
