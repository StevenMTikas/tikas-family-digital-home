// Tasks module. See docs/02_Modules/Tasks.md: self-assignment for everyone,
// parent-to-child assignment for Admin/Super Admin only, completion rights
// broader than editing rights, Overdue/Today/This Week/Completed grouping.
//
// Initial data fetched directly from the database, per
// Application_Architecture.md — mirrors the query logic in
// app/api/tasks/route.ts's GET handler. Client-side actions go through
// /api/tasks via lib/api/tasks.ts.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser, hasAdminAuthorityOver } from "@/lib/core/permissions";
import { toISODate } from "@/lib/calendar/dates";
import TasksPageClient, { type TaskData, type FamilyMemberOption } from "./TasksPageClient";

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
  recurrence_frequency: TaskData["recurrenceFrequency"];
  subject_id: string | null;
  subject_name: string | null;
  curriculum_reference: string | null;
  grade_or_score: string | null;
  parent_notes: string | null;
  signed_off_by: string | null;
  signed_off_at: string | null;
}

export default async function TasksPage() {
  const userId = (await headers()).get("x-user-id");
  const actor = userId ? await getAuthUser(userId) : null;
  if (!actor) redirect("/login");

  const db = getDb();

  const rows = db
    .prepare(
      `SELECT t.*, hd.subject_id, s.name AS subject_name, hd.curriculum_reference,
              hd.grade_or_score, hd.parent_notes, hd.signed_off_by, hd.signed_off_at
       FROM tasks t
       LEFT JOIN homework_details hd ON hd.task_id = t.id
       LEFT JOIN subjects s ON s.id = hd.subject_id`
    )
    .all() as TaskRow[];

  const tasks: TaskData[] = rows
    .filter(
      (row) =>
        row.visibility === "public" ||
        actor.id === row.owner_id ||
        actor.id === row.assigned_by ||
        canManageUser(actor, row.owner_id)
    )
    .map((row) => ({
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
      // Not canManageUser — its "self" clause would wrongly let a task's
      // owner edit their own task even when someone else assigned it.
      canEdit: actor.id === row.assigned_by || hasAdminAuthorityOver(actor, row.owner_id),
      canComplete:
        actor.id === row.owner_id || actor.id === row.assigned_by || canManageUser(actor, row.owner_id),
      // Homeschool.md: Admin/Super-Admin authority over the owner, no
      // self-assigner carve-out — a child can't grade their own homework.
      canGrade: hasAdminAuthorityOver(actor, row.owner_id),
    }));

  const memberRows = db
    .prepare(`SELECT id, full_name, calendar_color FROM users WHERE role != 'external_viewer'`)
    .all() as { id: string; full_name: string; calendar_color: string | null }[];

  const familyMembers: FamilyMemberOption[] = memberRows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    calendarColor: row.calendar_color,
  }));

  // Homeschool.md: which owners this actor could grade homework for, so the
  // Add/Edit Task form can show/hide grade/notes/sign-off fields client-side
  // without a round trip — matches hasAdminAuthorityOver exactly.
  const canGradeOwnerIds = familyMembers.filter((m) => hasAdminAuthorityOver(actor, m.id)).map((m) => m.id);

  return (
    <TasksPageClient
      tasks={tasks}
      familyMembers={familyMembers}
      currentUserId={actor.id}
      canAssignToOthers={actor.role === "admin" || actor.role === "super_admin"}
      canGradeOwnerIds={canGradeOwnerIds}
      todayIso={toISODate(new Date())}
    />
  );
}
