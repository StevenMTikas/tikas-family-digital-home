// Single-task API. See docs/02_Modules/Tasks.md: completion rights (owner,
// assigner, or admin) are broader than editing rights (assigner or admin
// only — the owner alone cannot edit, only complete). See
// docs/02_Modules/Homeschool.md: grading/parent-notes/sign-off are a third,
// narrower right — Admin/Super-Admin authority over the owner specifically,
// even narrower than editing (a self-assigned task's own "assigner" can
// still edit its title/due date, but can't grade it).
//
// Recurrence: same model as Events (see app/api/calendar/[id]/route.ts's
// header comment and lib/core/recurrence.ts) — editScope/scope of "this"
// (default), "future", or "series". Status changes (marking done/not done)
// and homework fields (subject, curriculum reference, grade, notes,
// sign-off) always apply to just the single occurrence being touched,
// regardless of scope — same reasoning as due_date.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser, hasAdminAuthorityOver, type AuthUser } from "@/lib/core/permissions";
import type { RecurrenceFrequency } from "@/lib/core/recurrence";
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

// Deliberately not canManageUser — its "self" clause would let a task's
// owner edit their own task even when someone else assigned it, which
// Tasks.md rules out: "the owner alone... cannot edit it, only complete it."
function canEdit(actorId: string, actor: AuthUser, row: TaskRow): boolean {
  return actorId === row.assigned_by || hasAdminAuthorityOver(actor, row.owner_id);
}

function canComplete(actorId: string, actor: AuthUser, row: TaskRow): boolean {
  return actorId === row.owner_id || actorId === row.assigned_by || canManageUser(actor, row.owner_id);
}

// Homeschool.md: no actorId === assigned_by carve-out, unlike canEdit — a
// child who self-assigned their own homework still can't grade it.
function canGrade(actor: AuthUser, row: TaskRow): boolean {
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
    canEdit: canEdit(actorId, actor, row),
    canComplete: canComplete(actorId, actor, row),
    canGrade: canGrade(actor, row),
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
  const row = db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id) as TaskRow | undefined;
  if (!row) return errorResponse("NOT_FOUND", "No such task.", 404);

  const body = await req.json().catch(() => null);

  const editScope = parseScope(body?.editScope);
  const applyToSeries = row.recurrence_id !== null && editScope !== "this";

  // Homework.md fields — subject/curriculumReference follow canEdit;
  // gradeOrScore/parentNotes/signedOff follow the narrower canGrade. All
  // apply to just this occurrence, never fanned out across a series.
  const hasSubjectField = "subject" in (body ?? {});
  const hasCurriculumField = "curriculumReference" in (body ?? {});
  // Homeschool.md: an assignment is always public, enforced here too (not
  // just by the Homeschool screen never showing a visibility control) — a
  // task that already has a subject, or is gaining one in this same
  // request, can't be set/left private via a direct API call.
  const isOrWillBeHomework = row.subject_id !== null || (hasSubjectField && typeof body.subject === "string" && body.subject.trim() !== "");

  // Safe to apply across a whole series — never due_date, which only ever
  // moves the single occurrence being edited.
  const seriesUpdates: Record<string, unknown> = {};
  if (typeof body?.title === "string" && body.title.trim()) seriesUpdates.title = body.title.trim();
  if (typeof body?.description === "string" || body?.description === null) {
    seriesUpdates.description = body.description;
  }
  if (body?.visibility === "public" || body?.visibility === "private") {
    seriesUpdates.visibility = isOrWillBeHomework ? "public" : body.visibility;
  }

  const dueDateUpdate = typeof body?.dueDate === "string" && body.dueDate ? body.dueDate : undefined;
  const changingStatus = body?.status === "done" || body?.status === "not_done";
  const changingDetails = Object.keys(seriesUpdates).length > 0 || !!dueDateUpdate;
  const changingHomeworkDetails = hasSubjectField || hasCurriculumField;
  const hasGradeField = "gradeOrScore" in (body ?? {});
  const hasNotesField = "parentNotes" in (body ?? {});
  const hasSignedOffField = "signedOff" in (body ?? {});
  const changingGradeFields = hasGradeField || hasNotesField || hasSignedOffField;

  if (!changingStatus && !changingDetails && !changingHomeworkDetails && !changingGradeFields) {
    return errorResponse("INVALID_INPUT", "No changes provided.", 400);
  }
  if (changingDetails && !canEdit(actorId, actor, row)) {
    return errorResponse("FORBIDDEN", "Only whoever assigned this task or an admin can edit it.", 403);
  }
  if (changingStatus && !canComplete(actorId, actor, row)) {
    return errorResponse("FORBIDDEN", "Only the owner, assigner, or an admin can complete this task.", 403);
  }
  if (changingHomeworkDetails && !canEdit(actorId, actor, row)) {
    return errorResponse("FORBIDDEN", "Only whoever assigned this task or an admin can edit its subject.", 403);
  }
  if (changingGradeFields && !canGrade(actor, row)) {
    return errorResponse("FORBIDDEN", "Only an Admin or Super Admin can set grade, notes, or sign-off.", 403);
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

    if (hasSubjectField) {
      const subjectValue = typeof body.subject === "string" ? body.subject.trim() : "";
      const exists = db.prepare(`SELECT 1 FROM homework_details WHERE task_id = ?`).get(id);
      if (!subjectValue) {
        // Clearing Subject removes the whole homework link.
        if (exists) db.prepare(`DELETE FROM homework_details WHERE task_id = ?`).run(id);
      } else {
        const subjectId = ensureSubjectExists(subjectValue, actorId);
        if (exists) {
          db.prepare(`UPDATE homework_details SET subject_id = ? WHERE task_id = ?`).run(subjectId, id);
        } else {
          db.prepare(`INSERT INTO homework_details (task_id, subject_id) VALUES (?, ?)`).run(id, subjectId);
        }
      }
    }

    if (hasCurriculumField) {
      const value = typeof body.curriculumReference === "string" ? body.curriculumReference.trim() || null : null;
      db.prepare(`UPDATE homework_details SET curriculum_reference = ? WHERE task_id = ?`).run(value, id);
    }

    if (hasGradeField) {
      const value = typeof body.gradeOrScore === "string" ? body.gradeOrScore.trim() || null : null;
      db.prepare(`UPDATE homework_details SET grade_or_score = ? WHERE task_id = ?`).run(value, id);
    }
    if (hasNotesField) {
      const value = typeof body.parentNotes === "string" ? body.parentNotes.trim() || null : null;
      db.prepare(`UPDATE homework_details SET parent_notes = ? WHERE task_id = ?`).run(value, id);
    }
    if (hasSignedOffField) {
      if (body.signedOff === true) {
        db.prepare(`UPDATE homework_details SET signed_off_by = ?, signed_off_at = ? WHERE task_id = ?`).run(
          actorId,
          new Date().toISOString(),
          id
        );
      } else {
        db.prepare(`UPDATE homework_details SET signed_off_by = NULL, signed_off_at = NULL WHERE task_id = ?`).run(id);
      }
    }
  });
  update();

  const updated = db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id) as TaskRow;
  return NextResponse.json(toTaskResponse(updated, actorId, actor));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor || !actorId) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const row = db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id) as TaskRow | undefined;
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
    // Not relying on homework_details' ON DELETE CASCADE — this codebase's
    // getDb() never sets `PRAGMA foreign_keys = ON` per-connection (SQLite's
    // default), so cascades declared in schema.sql don't actually fire at
    // runtime; see app/api/calendar/[id]/route.ts's event_assignments
    // cleanup for the same pattern already established here.
    db.prepare(`DELETE FROM homework_details WHERE task_id IN (${placeholders})`).run(...targetIds);
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
