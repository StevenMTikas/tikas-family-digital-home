// Family-wide Morning Briefing — Morning_Briefing.md: "aggregates the
// calendar/task view across all family members... rather than each
// person's individual suggestions or Guardian findings, which stay private."
// Same visibility rules as Calendar/Tasks' own list views, just for today only.

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser } from "@/lib/core/permissions";
import { toISODate } from "@/lib/calendar/dates";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface EventRow {
  id: string;
  title: string;
  date_time: string;
  created_by: string;
  visibility: "public" | "private";
}

interface TaskRow {
  id: string;
  title: string;
  owner_id: string;
  assigned_by: string;
  status: "not_done" | "done";
  visibility: "public" | "private";
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const db = getDb();
  const todayIso = toISODate(new Date());
  const tomorrowIso = toISODate(new Date(Date.now() + 24 * 60 * 60 * 1000));

  const users = db.prepare(`SELECT id, full_name, calendar_color FROM users`).all() as {
    id: string;
    full_name: string;
    calendar_color: string | null;
  }[];
  const nameById = new Map(users.map((u) => [u.id, u.full_name]));
  const colorById = new Map(users.map((u) => [u.id, u.calendar_color]));
  const assignmentStmt = db.prepare(`SELECT user_id FROM event_assignments WHERE event_id = ?`);

  const eventRows = db
    .prepare(`SELECT id, title, date_time, created_by, visibility FROM events WHERE date_time >= ? AND date_time < ? ORDER BY date_time`)
    .all(todayIso, tomorrowIso) as EventRow[];

  const events = eventRows
    .filter((row) => row.visibility === "public" || canManageUser(actor, row.created_by))
    .map((row) => ({
      id: row.id,
      title: row.title,
      dateTime: row.date_time,
      assigneeNames: (assignmentStmt.all(row.id) as { user_id: string }[]).map((r) => nameById.get(r.user_id) ?? "Unknown"),
      color: colorById.get(row.created_by) ?? null,
    }));

  const taskRows = db
    .prepare(`SELECT id, title, owner_id, assigned_by, status, visibility FROM tasks WHERE due_date = ? ORDER BY title`)
    .all(todayIso) as TaskRow[];

  const tasks = taskRows
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
      ownerName: nameById.get(row.owner_id) ?? "Unknown",
      status: row.status,
    }));

  return NextResponse.json({ events, tasks });
}
