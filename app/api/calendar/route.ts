// Calendar API. See docs/02_Modules/Calendar.md and
// docs/01_System_Architecture/API_Reference.md for the conventions this
// follows (standard REST, shared error shape, permission checks via
// /lib/core/permissions before any action). Event_Assignment (multi-user)
// is handled inline as part of create/update, per API_Reference.md's note.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser } from "@/lib/core/permissions";
import { getWeekStart, toISODate, parseISODate } from "@/lib/calendar/dates";

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  date_time: string;
  created_by: string;
  visibility: "public" | "private";
  reminder_lead_time: string | null;
}

function getAssigneeIds(eventId: string): string[] {
  return (
    getDb().prepare(`SELECT user_id FROM event_assignments WHERE event_id = ?`).all(eventId) as {
      user_id: string;
    }[]
  ).map((row) => row.user_id);
}

// See Calendar.md's Permissions section: "private events are visible only to
// their creator and admins" — the same authority (creator, Super Admin, or an
// Admin scoped to the creator) that governs edit rights, hence reusing
// canManageUser rather than a separate check.
function toEventResponse(row: EventRow, actorId: string, canEdit: boolean) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dateTime: row.date_time,
    visibility: row.visibility,
    reminderLeadTime: row.reminder_lead_time,
    createdBy: row.created_by,
    assigneeIds: getAssigneeIds(row.id),
    canEdit,
  };
}

export async function GET(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const weekParam = req.nextUrl.searchParams.get("week") ?? undefined;
  const weekStart = getWeekStart(parseISODate(weekParam, new Date()));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const rows = getDb()
    .prepare(`SELECT * FROM events WHERE date_time >= ? AND date_time < ? ORDER BY date_time`)
    .all(toISODate(weekStart), toISODate(weekEnd)) as EventRow[];

  const visible = rows.filter(
    (row) => row.visibility === "public" || canManageUser(actor, row.created_by)
  );

  return NextResponse.json(
    visible.map((row) => toEventResponse(row, actor.id, canManageUser(actor, row.created_by)))
  );
}

export async function POST(req: NextRequest) {
  const actorId = req.headers.get("x-user-id");
  const actor = actorId ? await getAuthUser(actorId) : null;
  if (!actor) return errorResponse("UNAUTHENTICATED", "Login required.", 401);

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : null;
  const dateTime = typeof body?.dateTime === "string" ? body.dateTime : "";
  const visibility = body?.visibility === "private" ? "private" : "public";
  const reminderLeadTime = typeof body?.reminderLeadTime === "string" ? body.reminderLeadTime : null;
  const assigneeIds = Array.isArray(body?.assigneeIds) ? body.assigneeIds.filter((id: unknown) => typeof id === "string") : [];

  if (!title || !dateTime) {
    return errorResponse("INVALID_INPUT", "Title and date/time are required.", 400);
  }
  if (assigneeIds.length === 0) {
    return errorResponse("INVALID_INPUT", "At least one assignee is required.", 400);
  }

  const db = getDb();
  const id = randomUUID();

  const insert = db.transaction(() => {
    db.prepare(
      `INSERT INTO events (id, title, description, date_time, created_by, visibility, reminder_lead_time)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, title, description, dateTime, actor.id, visibility, reminderLeadTime);

    const insertAssignment = db.prepare(
      `INSERT INTO event_assignments (event_id, user_id) VALUES (?, ?)`
    );
    for (const userId of assigneeIds) insertAssignment.run(id, userId);
  });
  insert();

  const row = db.prepare(`SELECT * FROM events WHERE id = ?`).get(id) as EventRow;

  // Event-driven Advisor trigger (Advisor.md: "generates a suggestion when
  // something happens that warrants one — ... a calendar gap detected").
  // Fire-and-forget — the LLM phrasing call shouldn't block the response,
  // and a failure here shouldn't fail the event creation that already succeeded.
  import("@/lib/core/ai/advisor")
    .then(({ runAdvisorDetectors }) => runAdvisorDetectors("event"))
    .catch((err) => console.error("[advisor] event-driven check failed:", err));

  return NextResponse.json(toEventResponse(row, actor.id, true), { status: 201 });
}
