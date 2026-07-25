// Single-task API. See docs/02_Modules/Tasks.md: completion rights (owner,
// assigner, or admin) are broader than editing rights (assigner or admin
// only — the owner alone cannot edit, only complete).

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser, hasAdminAuthorityOver, type AuthUser } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  owner_id: string;
  due_date: string | null;
  status: "not_done" | "done";
  created_by: string;
  assigned_by: string;
  visibility: "public" | "private";
}

// Deliberately not canManageUser — its "self" clause would let a task's
// owner edit their own task even when someone else assigned it, which
// Tasks.md rules out: "the owner alone... cannot edit it, only complete it."
function canEdit(actorId: string, actor: AuthUser, row: TaskRow): boolean {
  return actorId === row.assigned_by || hasAdminAuthorityOver(actor, row.owner_id);
}

function canComplete(actorId: string, actor: AuthUser, row: TaskRow): boolean {
  return actorId === row.owner_id || actorId === row.assigned_by || canManageUser(actor, row.owner_id);
}

function toTaskResponse(row: TaskRow, actorId: string, actor: AuthUser) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    ownerId: row.owner_id,
    dueDate: row.due_date,
    status: row.status,
    assignedBy: row.assigned_by,
    visibility: row.visibility,
    canEdit: canEdit(actorId, actor, row),
    canComplete: canComplete(actorId, actor, row),
  };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such task.", 404);

  const body = await req.json().catch(() => null);
  const updates: Record<string, unknown> = {};
  if (typeof body?.title === "string" && body.title.trim()) updates.title = body.title.trim();
  if (typeof body?.description === "string" || body?.description === null) {
    updates.description = body.description;
  }
  if (typeof body?.dueDate === "string" && body.dueDate) updates.due_date = body.dueDate;
  if (body?.visibility === "public" || body?.visibility === "private") updates.visibility = body.visibility;

  const changingStatus = body?.status === "done" || body?.status === "not_done";
  const changingDetails = Object.keys(updates).length > 0;

  if (!changingStatus && !changingDetails) {
    return errorResponse("INVALID_INPUT", "No changes provided.", 400);
  }

  // Detail edits always need the tighter edit gate; a status-only change
  // (the common case — the owner ticking their own task done) only needs
  // the broader completion gate.
  if (changingDetails && !canEdit(actorId, actor, row)) {
    return errorResponse("FORBIDDEN", "Only whoever assigned this task or an admin can edit it.", 403);
  }
  if (changingStatus && !canComplete(actorId, actor, row)) {
    return errorResponse("FORBIDDEN", "Only the owner, assigner, or an admin can complete this task.", 403);
  }
  if (changingStatus) updates.status = body.status;

  const setClause = Object.keys(updates)
    .map((f) => `${f} = @${f}`)
    .join(", ");
  db.prepare(`UPDATE tasks SET ${setClause} WHERE id = @id`).run({ ...updates, id });

  const updated = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow;
  return NextResponse.json(toTaskResponse(updated, actorId, actor));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such task.", 404);

  if (!canEdit(actorId, actor, row)) {
    return errorResponse("FORBIDDEN", "Only whoever assigned this task or an admin can delete it.", 403);
  }

  db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
  return new NextResponse(null, { status: 204 });
}
