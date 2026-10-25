// Approving a draft is what actually creates the real assignment — a Task +
// Homework_Detail row, identical in shape to one created by hand on the
// Homeschool screen. Nothing before this point ever touched the real
// calendar/Tasks list. See docs/02_Modules/Homeschool.md.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser, hasAdminAuthorityOver } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface DraftRow {
  id: string;
  subject_id: string;
  child_id: string;
  title: string;
  curriculum_reference: string | null;
  suggested_due_date: string;
  status: string;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT * FROM assignment_drafts WHERE id = ?`).get(id) as DraftRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such draft.", 404);
  if (!hasAdminAuthorityOver(actor, row.child_id)) {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin over this child can approve their draft assignments.", 403);
  }
  if (row.status !== "pending") {
    return errorResponse("INVALID_STATE", "This draft has already been approved.", 409);
  }

  const taskId = randomUUID();
  const approve = db.transaction(() => {
    // Homeschool.md: assignments are always public and the approving admin
    // is the assigner — same shape as a manually-created assignment.
    db.prepare(
      `INSERT INTO tasks (id, title, owner_id, due_date, status, created_by, assigned_by, visibility)
       VALUES (?, ?, ?, ?, 'not_done', ?, ?, 'public')`
    ).run(taskId, row.title, row.child_id, row.suggested_due_date, actorId, actorId);

    db.prepare(
      `INSERT INTO homework_details (task_id, subject_id, curriculum_reference) VALUES (?, ?, ?)`
    ).run(taskId, row.subject_id, row.curriculum_reference);

    db.prepare(`UPDATE assignment_drafts SET status = 'approved', approved_task_id = ? WHERE id = ?`).run(taskId, id);
  });
  approve();

  return NextResponse.json({ draftId: id, taskId, status: "approved" });
}
