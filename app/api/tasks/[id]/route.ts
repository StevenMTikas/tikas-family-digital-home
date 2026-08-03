// Single-task API. See docs/02_Modules/Tasks.md: completion rights (owner,
// assigner, or admin) are broader than editing rights (assigner or admin
// only — the owner alone cannot edit, only complete).
//
// Recurrence: same model as Events (see app/api/calendar/[id]/route.ts's
// header comment and lib/core/recurrence.ts) — editScope/scope of "this"
// (default), "future", or "series". Status changes (marking done/not done)
// always apply to just the single occurrence being touched, regardless of
// scope — completing today's chore has no bearing on next week's.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser, hasAdminAuthorityOver, type AuthUser } from "@/lib/core/permissions";
import type { RecurrenceFrequency } from "@/lib/core/recurrence";

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
  recurrence_id: string | null;
  recurrence_frequency: RecurrenceFrequency | null;
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
    recurrenceId: row.recurrence_id,
    recurrenceFrequency: row.recurrence_frequency,
    canEdit: canEdit(actorId, actor, row),
    canComplete: canComplete(actorId, actor, row),
  };
}

type Scope = "this" | "future" | "series";

function parseScope(value: unknown): Scope {
  return value === "future" || value === "series" ? value : "this";
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

  const editScope = parseScope(body?.editScope);
  const applyToSeries = row.recurrence_id !== null && editScope !== "this";

  // Safe to apply across a whole series — never due_date, which only ever
  // moves the single occurrence being edited.
  const seriesUpdates: Record<string, unknown> = {};
  if (typeof body?.title === "string" && body.title.trim()) seriesUpdates.title = body.title.trim();
  if (typeof body?.description === "string" || body?.description === null) {
    seriesUpdates.description = body.description;
  }
  if (body?.visibility === "public" || body?.visibility === "private") seriesUpdates.visibility = body.visibility;

  const dueDateUpdate = typeof body?.dueDate === "string" && body.dueDate ? body.dueDate : undefined;
  const changingStatus = body?.status === "done" || body?.status === "not_done";
  const changingDetails = Object.keys(seriesUpdates).length > 0 || !!dueDateUpdate;

  if (!changingStatus && !changingDetails) {
    return errorResponse("INVALID_INPUT", "No changes provided.", 400);
  }
  if (changingDetails && !canEdit(actorId, actor, row)) {
    return errorResponse("FORBIDDEN", "Only whoever assigned this task or an admin can edit it.", 403);
  }
  if (changingStatus && !canComplete(actorId, actor, row)) {
    return errorResponse("FORBIDDEN", "Only the owner, assigner, or an admin can complete this task.", 403);
  }

  const targetIds: string[] = applyToSeries
    ? (
        editScope === "future"
          ? (db
              .prepare(`SELECT id FROM tasks WHERE recurrence_id = ? AND due_date >= ?`)
              .all(row.recurrence_id, row.due_date) as { id: string }[])
          : (db.prepare(`SELECT id FROM tasks WHERE recurrence_id = ?`).all(row.recurrence_id) as { id: string }[])
      ).map((r) => r.id)
    : [id];

  const update = db.transaction(() => {
    const fields = Object.keys(seriesUpdates);
    if (fields.length > 0) {
      const setClause = fields.map((f) => `${f} = @${f}`).join(", ");
      const stmt = db.prepare(`UPDATE tasks SET ${setClause} WHERE id = @id`);
      for (const targetId of targetIds) stmt.run({ ...seriesUpdates, id: targetId });
    }
    if (dueDateUpdate) {
      db.prepare(`UPDATE tasks SET due_date = ? WHERE id = ?`).run(dueDateUpdate, id);
    }
    if (changingStatus) {
      db.prepare(`UPDATE tasks SET status = ? WHERE id = ?`).run(body.status, id);
    }
  });
  update();

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

  const scope = parseScope(req.nextUrl.searchParams.get("scope"));

  const targetIds: string[] =
    row.recurrence_id && scope !== "this"
      ? (
          scope === "future"
            ? (db
                .prepare(`SELECT id FROM tasks WHERE recurrence_id = ? AND due_date >= ?`)
                .all(row.recurrence_id, row.due_date) as { id: string }[])
            : (db.prepare(`SELECT id FROM tasks WHERE recurrence_id = ?`).all(row.recurrence_id) as { id: string }[])
        ).map((r) => r.id)
      : [id];

  const del = db.transaction(() => {
    const placeholders = targetIds.map(() => "?").join(",");
    db.prepare(`DELETE FROM tasks WHERE id IN (${placeholders})`).run(...targetIds);

    if (scope === "future" && row.recurrence_id) {
      const remaining = db
        .prepare(`SELECT id FROM tasks WHERE recurrence_id = ? ORDER BY due_date DESC LIMIT 1`)
        .get(row.recurrence_id) as { id: string } | undefined;
      if (remaining) {
        db.prepare(`UPDATE tasks SET recurrence_until = ? WHERE id = ?`).run(row.due_date, remaining.id);
      }
    }
  });
  del();

  return new NextResponse(null, { status: 204 });
}
