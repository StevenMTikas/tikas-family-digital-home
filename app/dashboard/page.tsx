// Dashboard — the app's home screen, default content on open is the Morning
// Briefing. See docs/02_Modules/Dashboard.md, docs/05_AI/Morning_Briefing.md.
// Initial (individual, "My Day") data fetched directly from the database,
// same pattern as Calendar/Administration; the family-wide toggle re-fetches
// client-side via /api/dashboard/family since that's a distinct query.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuthUser } from "@/lib/core/permissions";
import { toISODate } from "@/lib/calendar/dates";
import { getWeather } from "@/lib/weather";
import DashboardPageClient, { type SuggestionData, type TodayEvent, type TodayTask } from "./DashboardPageClient";

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
  status: "not_done" | "done";
}

interface SuggestionRow {
  id: string;
  module: string | null;
  content: string;
  related_entity_id: string | null;
}

export default async function DashboardPage() {
  const userId = (await headers()).get("x-user-id");
  const actor = userId ? await getAuthUser(userId) : null;
  if (!actor) redirect("/login");

  const db = getDb();
  const userRow = db.prepare(`SELECT full_name FROM users WHERE id = ?`).get(actor.id) as { full_name: string };
  const todayIso = toISODate(new Date());
  const tomorrowIso = toISODate(new Date(Date.now() + 24 * 60 * 60 * 1000));

  // Today's events assigned to (or created by) this person — Morning_Briefing.md.
  const eventRows = db
    .prepare(
      `SELECT e.id, e.title, e.date_time, e.created_by, e.visibility FROM events e
       WHERE e.date_time >= ? AND e.date_time < ?
       AND (e.visibility = 'public' OR e.created_by = ?)
       AND (e.created_by = ? OR EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id AND ea.user_id = ?))
       ORDER BY e.date_time`
    )
    .all(todayIso, tomorrowIso, actor.id, actor.id, actor.id) as EventRow[];

  const todaysEvents: TodayEvent[] = eventRows.map((row) => ({ id: row.id, title: row.title, dateTime: row.date_time }));

  // Tasks due today, owned by this person — Morning_Briefing.md.
  const taskRows = db.prepare(`SELECT id, title, status FROM tasks WHERE owner_id = ? AND due_date = ?`).all(actor.id, todayIso) as TaskRow[];
  const todaysTasks: TodayTask[] = taskRows.map((row) => ({ id: row.id, title: row.title, status: row.status }));

  // Active suggestions — same query as GET /api/ai-suggestions?status=active (Advisor.md's display rules).
  const suggestionRows = db
    .prepare(
      `SELECT id, module, content, related_entity_id FROM ai_suggestions
       WHERE user_id = ? AND expired = 0 AND feedback = 'none' AND display_context = 'dashboard'
       ORDER BY relevancy_score DESC, generated_at DESC LIMIT 10`
    )
    .all(actor.id) as SuggestionRow[];
  const suggestions: SuggestionData[] = suggestionRows.map((row) => ({
    id: row.id,
    module: row.module,
    content: row.content,
    relatedEntityId: row.related_entity_id,
  }));

  // Guardian's urgent findings — Morning_Briefing.md: "urgent items in
  // particular should be visible here, not just on the Admin Dashboard."
  // Only the Super Admin ever receives these (guardian.ts's passive/urgent
  // channels have no per-person targeting), so this is naturally empty for
  // anyone else without needing an explicit role check.
  const urgentRows = db
    .prepare(`SELECT id, text, created_at FROM notifications WHERE user_id = ? AND severity = 'urgent' ORDER BY created_at DESC`)
    .all(actor.id) as { id: string; text: string; created_at: string }[];

  const weather = await getWeather();

  return (
    <DashboardPageClient
      fullName={userRow.full_name}
      todaysEvents={todaysEvents}
      todaysTasks={todaysTasks}
      suggestions={suggestions}
      urgentFindings={urgentRows.map((r) => ({ id: r.id, text: r.text, createdAt: r.created_at }))}
      weather={weather}
    />
  );
}
