// Tasks API. See docs/01_System_Architecture/API_Reference.md for the
// route/error conventions this implements, docs/02_Modules/Tasks.md for
// business rules (parent-to-child assignment only, visibility, edit rights),
// and docs/01_System_Architecture/Data_Model.md for the Task entity.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
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

// Edit rights deliberately do NOT use canManageUser here — its "self" clause
// would let a task's owner edit their own task even when someone else
// assigned it, which Tasks.md explicitly rules out: "the owner alone...
// cannot edit it, only complete it." hasAdminAuthorityOver has no such clause.
function canEditTask(actorId: string, actor: AuthUser, row: TaskRow): boolean {
  return actorId === row.assigned_by || hasAdminAuthorityOver(actor, row.owner_id);
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
    canEdit: canEditTask(actorId, actor, row),
    canComplete: actorId === row.owner_id || actorId === row.assigned_by || canManageUser(actor, row.owner_id),
  };
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const rows = getDb().prepare(`SELECT * FROM tasks`).all() as TaskRow[];

  const visible = rows.filter(
    (row) =>
      row.visibility === "public" ||
      actorId === row.owner_id ||
      actorId === row.assigned_by ||
      canManageUser(actor, row.owner_id)
  );

  return NextResponse.json(visible.map((row) => toTaskResponse(row, actorId, actor)));
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() || null : null;
  const dueDate = typeof body?.dueDate === "string" ? body.dueDate : null;
  const visibility = body?.visibility === "private" ? "private" : "public";
  const ownerId = typeof body?.ownerId === "string" && body.ownerId ? body.ownerId : actorId;

  if (!title || !dueDate) {
    return errorResponse("INVALID_INPUT", "Title and due date are required.", 400);
  }

  // Per Tasks.md: assigning to someone else is a role check (Admin/Super
  // Admin, "any other family member"), deliberately not scope-restricted —
  // a different rule from who can later edit/complete the task.
  if (ownerId !== actorId && actor.role === "basic_user") {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin can assign a task to someone else.", 403);
  }

  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO tasks (id, title, description, owner_id, due_date, status, created_by, assigned_by, visibility)
     VALUES (?, ?, ?, ?, ?, 'not_done', ?, ?, ?)`
  ).run(id, title, description, ownerId, dueDate, actorId, actorId, visibility);

  const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow;
  return NextResponse.json(toTaskResponse(row, actorId, actor), { status: 201 });
}
