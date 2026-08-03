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
}

export default async function TasksPage() {
  const userId = (await headers()).get("x-user-id");
  const actor = userId ? await getAuthUser(userId) : null;
  if (!actor) redirect("/login");

  const db = getDb();

  const rows = db.prepare(`SELECT * FROM tasks`).all() as TaskRow[];

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
      // Not canManageUser — its "self" clause would wrongly let a task's
      // owner edit their own task even when someone else assigned it.
      canEdit: actor.id === row.assigned_by || hasAdminAuthorityOver(actor, row.owner_id),
      canComplete:
        actor.id === row.owner_id || actor.id === row.assigned_by || canManageUser(actor, row.owner_id),
    }));

  const memberRows = db
    .prepare(`SELECT id, full_name, calendar_color FROM users WHERE role != 'external_viewer'`)
    .all() as { id: string; full_name: string; calendar_color: string | null }[];

  const familyMembers: FamilyMemberOption[] = memberRows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    calendarColor: row.calendar_color,
  }));

  return (
    <TasksPageClient
      tasks={tasks}
      familyMembers={familyMembers}
      currentUserId={actor.id}
      canAssignToOthers={actor.role === "admin" || actor.role === "super_admin"}
      todayIso={toISODate(new Date())}
    />
  );
}
