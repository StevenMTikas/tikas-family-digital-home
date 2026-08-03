// Calendar module. See docs/02_Modules/Calendar.md: weekly view (MVP-only
// view), per-person color coding, public/private visibility, editing
// restricted to creator + admins.
//
// Initial data fetched directly from the database, per
// Application_Architecture.md ("Server Components handle most data fetching
// natively, directly from the database/API layer") — mirrors the query
// logic in app/api/calendar/route.ts's GET handler. Client-side actions
// (add/edit/delete, week navigation) go through /api/calendar via
// lib/api/calendar.ts.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuthUser, canManageUser } from "@/lib/core/permissions";
import { getWeekStart, getMonthGridStart, toISODate, parseISODate } from "@/lib/calendar/dates";
import CalendarPageClient, { type CalendarEventData, type FamilyMemberOption, type CalendarView } from "./CalendarPageClient";

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  date_time: string;
  created_by: string;
  visibility: "public" | "private";
  category: CalendarEventData["category"];
  reminder_lead_time: string | null;
  recurrence_id: string | null;
  recurrence_frequency: CalendarEventData["recurrenceFrequency"];
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const userId = (await headers()).get("x-user-id");
  const actor = userId ? await getAuthUser(userId) : null;
  if (!actor) redirect("/login");

  const { date, view: rawView } = await searchParams;
  const view: CalendarView = rawView === "month" || rawView === "day" ? rawView : "week";
  const anchorDate = parseISODate(date, new Date());

  // Fetch range depends on view — month pads out to the full 6-row grid
  // (including leading/trailing days from adjacent months) so those cells
  // show real events too, not just current-month days.
  let rangeStart: Date;
  let rangeEnd: Date;
  if (view === "month") {
    rangeStart = getMonthGridStart(anchorDate);
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 42);
  } else if (view === "day") {
    rangeStart = anchorDate;
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
  } else {
    rangeStart = getWeekStart(anchorDate);
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 7);
  }

  const db = getDb();

  const rows = db
    .prepare(`SELECT * FROM events WHERE date_time >= ? AND date_time < ? ORDER BY date_time`)
    .all(toISODate(rangeStart), toISODate(rangeEnd)) as EventRow[];

  const assignmentStmt = db.prepare(`SELECT user_id FROM event_assignments WHERE event_id = ?`);

  const events: CalendarEventData[] = rows
    .filter((row) => row.visibility === "public" || canManageUser(actor, row.created_by))
    .map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      dateTime: row.date_time,
      visibility: row.visibility,
      category: row.category,
      reminderLeadTime: row.reminder_lead_time,
      recurrenceId: row.recurrence_id,
      recurrenceFrequency: row.recurrence_frequency,
      createdBy: row.created_by,
      assigneeIds: (assignmentStmt.all(row.id) as { user_id: string }[]).map((r) => r.user_id),
      canEdit: canManageUser(actor, row.created_by),
    }));

  const familyMembers = db
    .prepare(`SELECT id, full_name, calendar_color FROM users WHERE role != 'external_viewer'`)
    .all() as { id: string; full_name: string; calendar_color: string | null }[];

  const members: FamilyMemberOption[] = familyMembers.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    calendarColor: row.calendar_color,
  }));

  return (
    <CalendarPageClient
      view={view}
      anchorDateIso={toISODate(anchorDate)}
      events={events}
      familyMembers={members}
      currentUserId={actor.id}
    />
  );
}
