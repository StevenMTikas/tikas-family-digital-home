// Tasks API. See docs/01_System_Architecture/API_Reference.md for the
// route/error conventions this implements, docs/02_Modules/Tasks.md for
// business rules (parent-to-child assignment only, visibility, edit rights),
// docs/02_Modules/Homeschool.md for the optional homework fields, and
// docs/01_System_Architecture/Data_Model.md for the Task/Homework_Detail
// entities.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser, hasAdminAuthorityOver, type AuthUser } from "@/lib/core/permissions";
import { RECURRENCE_FREQUENCIES, topUpTaskSeries, taskRecurrenceWindowEnd, type RecurrenceFrequency } from "@/lib/core/recurrence";
import { ensureSubjectExists } from "@/lib/core/homework/subjects";

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
  subject_id: string | null;
  subject_name: string | null;
  curriculum_reference: string | null;
  grade_or_score: string | null;
  parent_notes: string | null;
  signed_off_by: string | null;
  signed_off_at: string | null;
}

const TASK_SELECT = `
  SELECT t.*, hd.subject_id, s.name AS subject_name, hd.curriculum_reference,
         hd.grade_or_score, hd.parent_notes, hd.signed_off_by, hd.signed_off_at
  FROM tasks t
  LEFT JOIN homework_details hd ON hd.task_id = t.id
  LEFT JOIN subjects s ON s.id = hd.subject_id
`;

// Edit rights deliberately do NOT use canManageUser here — its "self" clause
// would let a task's owner edit their own task even when someone else
// assigned it, which Tasks.md explicitly rules out: "the owner alone...
// cannot edit it, only complete it." hasAdminAuthorityOver has no such clause.
function canEditTask(actorId: string, actor: AuthUser, row: { assigned_by: string; owner_id: string }): boolean {
  return actorId === row.assigned_by || hasAdminAuthorityOver(actor, row.owner_id);
}

// Homeschool.md: grading/parent-notes/sign-off are Admin/Super-Admin-only,
// regardless of who assigned the task — even a self-assigned task's
// "assigner" (the child themselves) can't grade their own homework, so this
// deliberately doesn't include the actorId === assigned_by clause canEditTask has.
function canGradeTask(actor: AuthUser, row: { owner_id: string }): boolean {
  return hasAdminAuthorityOver(actor, row.owner_id);
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
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    curriculumReference: row.curriculum_reference,
    gradeOrScore: row.grade_or_score,
    parentNotes: row.parent_notes,
    signedOffBy: row.signed_off_by,
    signedOffAt: row.signed_off_at,
    canEdit: canEditTask(actorId, actor, row),
    canComplete: actorId === row.owner_id || actorId === row.assigned_by || canManageUser(actor, row.owner_id),
    canGrade: canGradeTask(actor, row),
  };
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const rows = getDb().prepare(TASK_SELECT).all() as TaskRow[];

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
  const ownerId = typeof body?.ownerId === "string" && body.ownerId ? body.ownerId : actorId;
  const recurrenceFrequency = RECURRENCE_FREQUENCIES.includes(body?.recurrence) ? (body.recurrence as RecurrenceFrequency) : null;
  const subjectName = typeof body?.subject === "string" ? body.subject.trim() : "";
  const curriculumReference = typeof body?.curriculumReference === "string" ? body.curriculumReference.trim() || null : null;
  // Homeschool.md: an assignment (anything with a Subject) is always public
  // — enforced server-side, not just by the Homeschool screen never showing
  // a visibility control, so a direct API call can't sneak a private one in.
  const visibility = subjectName ? "public" : body?.visibility === "private" ? "private" : "public";

  if (!title || !dueDate) {
    return errorResponse("INVALID_INPUT", "Title and due date are required.", 400);
  }

  // Per Tasks.md: assigning to someone else is a role check (Admin/Super
  // Admin, "any other family member"), deliberately not scope-restricted —
  // a different rule from who can later edit/complete the task. Written as
  // an allow-list, not a `!== "basic_user"` deny-list — a deny-list would
  // silently let a 4th role (external_viewer) through unintended.
  if (ownerId !== actorId && actor.role !== "admin" && actor.role !== "super_admin") {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin can assign a task to someone else.", 403);
  }

  // Homeschool.md: grading fields require Admin/Super-Admin authority over
  // the owner — checked before creation, same rule PATCH enforces.
  const wantsGradeFields = body?.gradeOrScore != null || body?.parentNotes != null || body?.signedOff === true;
  if (wantsGradeFields && !hasAdminAuthorityOver(actor, ownerId)) {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin can set grade, notes, or sign-off.", 403);
  }

  const db = getDb();
  const id = randomUUID();
  const recurrenceId = recurrenceFrequency ? randomUUID() : null;

  const create = db.transaction(() => {
    db.prepare(
      `INSERT INTO tasks (id, title, description, owner_id, due_date, status, created_by, assigned_by, visibility, recurrence_id, recurrence_frequency)
       VALUES (?, ?, ?, ?, ?, 'not_done', ?, ?, ?, ?, ?)`
    ).run(id, title, description, ownerId, dueDate, actorId, actorId, visibility, recurrenceId, recurrenceFrequency);

    if (subjectName) {
      const subjectId = ensureSubjectExists(subjectName, actorId);
      const gradeOrScore = typeof body?.gradeOrScore === "string" ? body.gradeOrScore.trim() || null : null;
      const parentNotes = typeof body?.parentNotes === "string" ? body.parentNotes.trim() || null : null;
      const signedOff = wantsGradeFields && body?.signedOff === true;
      db.prepare(
        `INSERT INTO homework_details (task_id, subject_id, curriculum_reference, grade_or_score, parent_notes, signed_off_by, signed_off_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        subjectId,
        curriculumReference,
        wantsGradeFields ? gradeOrScore : null,
        wantsGradeFields ? parentNotes : null,
        signedOff ? actorId : null,
        signedOff ? new Date().toISOString() : null
      );
    }
  });
  create();

  // Populate the rolling window of future occurrences right away, rather
  // than making the user wait for the next hourly scheduler tick.
  if (recurrenceId) topUpTaskSeries(recurrenceId, taskRecurrenceWindowEnd());

  const row = db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id) as TaskRow;
  return NextResponse.json(toTaskResponse(row, actorId, actor), { status: 201 });
}
