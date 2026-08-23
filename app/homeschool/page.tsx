// Homeschool module — a dedicated screen for homework/curriculum tracking,
// separate from Tasks even though it reuses the exact same Task entity (+
// the Homework_Detail companion table) and /api/tasks plumbing underneath.
// See docs/02_Modules/Homeschool.md.
//
// Initial data fetched directly from the database, per
// Application_Architecture.md — mirrors app/api/tasks/route.ts's GET
// handler, filtered down to homework items only (homework_details.task_id
// IS NOT NULL). Client-side actions go through /api/tasks via lib/api/tasks.ts.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser, hasAdminAuthorityOver } from "@/lib/core/permissions";
import { toISODate, parseISODate } from "@/lib/calendar/dates";
import HomeschoolPageClient, { type AssignmentData, type FamilyMemberOption } from "./HomeschoolPageClient";

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
  recurrence_frequency: AssignmentData["recurrenceFrequency"];
  subject_id: string;
  subject_name: string;
  curriculum_reference: string | null;
  grade_or_score: string | null;
  parent_notes: string | null;
  signed_off_by: string | null;
  signed_off_at: string | null;
}

export default async function HomeschoolPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const userId = (await headers()).get("x-user-id");
  const actor = userId ? await getAuthUser(userId) : null;
  if (!actor) redirect("/login");

  const { date } = await searchParams;
  const anchorDate = parseISODate(date, new Date());

  const db = getDb();

  // INNER JOIN, unlike Tasks' LEFT JOIN — this screen only ever shows
  // homework (a row with a Homework_Detail), never a plain chore/errand.
  const rows = db
    .prepare(
      `SELECT t.*, hd.subject_id, s.name AS subject_name, hd.curriculum_reference,
              hd.grade_or_score, hd.parent_notes, hd.signed_off_by, hd.signed_off_at
       FROM tasks t
       JOIN homework_details hd ON hd.task_id = t.id
       JOIN subjects s ON s.id = hd.subject_id`
    )
    .all() as TaskRow[];

  const assignments: AssignmentData[] = rows
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
      canEdit: actor.id === row.assigned_by || hasAdminAuthorityOver(actor, row.owner_id),
      canComplete:
        actor.id === row.owner_id || actor.id === row.assigned_by || canManageUser(actor, row.owner_id),
      canGrade: hasAdminAuthorityOver(actor, row.owner_id),
    }));

  const memberRows = db
    .prepare(`SELECT id, full_name, calendar_color, role, admin_scope FROM users WHERE role != 'external_viewer'`)
    .all() as { id: string; full_name: string; calendar_color: string | null; role: string; admin_scope: string | null }[];

  const familyMembers: FamilyMemberOption[] = memberRows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    calendarColor: row.calendar_color,
  }));

  // Steven's direction (2026-08-23): the assignee picker on this screen is
  // restricted to children only — "Malachi, or children on the account for
  // other families" — not every family member Tasks' picker shows. A child
  // is whoever appears in ANY admin's admin_scope, not role === 'basic_user'
  // (that role happens to be the only one Malachi holds today, but scope is
  // the actual authority relationship — Authorization.md's Admin Scope
  // section — and generalizes correctly to a future multi-child household).
  const childIds = new Set(
    memberRows
      .filter((row) => row.role === "admin" && row.admin_scope)
      .flatMap((row) => JSON.parse(row.admin_scope!) as string[])
  );
  const childUsers: FamilyMemberOption[] = familyMembers.filter((m) => childIds.has(m.id));

  const canGradeOwnerIds = familyMembers.filter((m) => hasAdminAuthorityOver(actor, m.id)).map((m) => m.id);

  return (
    <HomeschoolPageClient
      assignments={assignments}
      familyMembers={familyMembers}
      childUsers={childUsers}
      currentUserId={actor.id}
      canAssignToOthers={actor.role === "admin" || actor.role === "super_admin"}
      canGradeOwnerIds={canGradeOwnerIds}
      todayIso={toISODate(new Date())}
      anchorDateIso={toISODate(anchorDate)}
    />
  );
}
