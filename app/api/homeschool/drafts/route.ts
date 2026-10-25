// Lists Assignment_Drafts for review. Defaults to pending only — the queue
// a parent actually works through; pass status=approved to see history for
// a batch. See docs/02_Modules/Homeschool.md.

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
  subject_name: string;
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const childId = req.nextUrl.searchParams.get("childId");
  if (!childId) return errorResponse("INVALID_INPUT", "childId is required.", 400);
  if (!hasAdminAuthorityOver(actor, childId)) {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin over this child can view their draft assignments.", 403);
  }

  const status = req.nextUrl.searchParams.get("status") === "approved" ? "approved" : "pending";

  const rows = getDb()
    .prepare(
      `SELECT ad.*, s.name AS subject_name
       FROM assignment_drafts ad
       JOIN subjects s ON s.id = ad.subject_id
       WHERE ad.child_id = ? AND ad.status = ?
       ORDER BY ad.suggested_due_date`
    )
    .all(childId, status) as DraftRow[];

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      subjectId: r.subject_id,
      subjectName: r.subject_name,
      childId: r.child_id,
      batchId: r.generation_batch_id,
      title: r.title,
      curriculumReference: r.curriculum_reference,
      suggestedDueDate: r.suggested_due_date,
      status: r.status,
      approvedTaskId: r.approved_task_id,
    }))
  );
}
