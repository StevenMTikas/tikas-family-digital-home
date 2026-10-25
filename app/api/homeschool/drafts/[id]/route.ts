// Single-draft API: PATCH edits a pending draft's title/due date/curriculum
// reference before approval; DELETE rejects it (deleted outright, no
// rejected-status history kept, per Homeschool.md). Both Admin/Super-Admin
// only, and only over the draft's own child.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, hasAdminAuthorityOver } from "@/lib/core/permissions";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface DraftRow {
  id: string;
  subject_id: string;
  child_id: string;
  generation_batch_id: string;
  title: string;
  curriculum_reference: string | null;
  suggested_due_date: string;
  status: string;
  approved_task_id: string | null;
}

function toResponse(r: DraftRow) {
  return {
    id: r.id,
    subjectId: r.subject_id,
    childId: r.child_id,
    batchId: r.generation_batch_id,
    title: r.title,
    curriculumReference: r.curriculum_reference,
    suggestedDueDate: r.suggested_due_date,
    status: r.status,
    approvedTaskId: r.approved_task_id,
  };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT * FROM assignment_drafts WHERE id = ?`).get(id) as DraftRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such draft.", 404);
  if (!hasAdminAuthorityOver(actor, row.child_id)) {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin over this child can edit their draft assignments.", 403);
  }
  if (row.status !== "pending") {
    return errorResponse("INVALID_STATE", "This draft has already been approved and can't be edited here — edit the real assignment instead.", 409);
  }

  const body = await req.json().catch(() => null);
  const updates: Record<string, unknown> = {};
  if (typeof body?.title === "string" && body.title.trim()) updates.title = body.title.trim();
  if (typeof body?.suggestedDueDate === "string" && body.suggestedDueDate) updates.suggested_due_date = body.suggestedDueDate;
  if (typeof body?.curriculumReference === "string" || body?.curriculumReference === null) {
    updates.curriculum_reference = body.curriculumReference;
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse("INVALID_INPUT", "No changes provided.", 400);
  }

  const setClause = Object.keys(updates)
    .map((f) => `${f} = @${f}`)
    .join(", ");
  db.prepare(`UPDATE assignment_drafts SET ${setClause} WHERE id = @id`).run({ ...updates, id });

  const updated = db.prepare(`SELECT * FROM assignment_drafts WHERE id = ?`).get(id) as DraftRow;
  return NextResponse.json(toResponse(updated));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`SELECT child_id, status FROM assignment_drafts WHERE id = ?`).get(id) as
    | { child_id: string; status: string }
    | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such draft.", 404);
  if (!hasAdminAuthorityOver(actor, row.child_id)) {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin over this child can reject their draft assignments.", 403);
  }
  if (row.status !== "pending") {
    return errorResponse("INVALID_STATE", "This draft has already been approved.", 409);
  }

  db.prepare(`DELETE FROM assignment_drafts WHERE id = ?`).run(id);
  return new NextResponse(null, { status: 204 });
}
