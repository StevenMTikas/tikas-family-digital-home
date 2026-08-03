// Recurrence engine for recurring Events and Tasks (Calendar.md/Tasks.md).
// Each occurrence is a real, independently editable/deletable row in
// `events`/`tasks` — there's no separate "recurrence rule" entity. All
// occurrences of one series share `recurrence_id` + `recurrence_frequency`;
// this module tops up a rolling window of future occurrences (WINDOW_MONTHS
// ahead) so a series set to run indefinitely never "runs dry" without the
// user having to act — called once synchronously right after a recurring
// item is created, and periodically by scripts/scheduler-hourly.ts after
// that. `recurrence_until`, if set on any row in a series (stamped when a
// "this and future" delete truncates it), caps how far generation extends.

import { randomUUID } from "crypto";
import { getDb } from "@/db/client";

export type RecurrenceFrequency = "daily" | "weekly" | "biweekly" | "monthly" | "yearly";
export const RECURRENCE_FREQUENCIES: RecurrenceFrequency[] = ["daily", "weekly", "biweekly", "monthly", "yearly"];

const WINDOW_MONTHS = 3;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateTimeLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Adds `months` to `date`, clamping day-of-month overflow (Jan 31 + 1 month -> Feb 28/29; Feb 29 + 1 year -> Feb 28) rather than overflowing into the next month. */
function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getDate();
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const daysInTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, daysInTargetMonth));
  target.setHours(date.getHours(), date.getMinutes(), date.getSeconds(), 0);
  return target;
}

function addInterval(date: Date, frequency: RecurrenceFrequency): Date {
  const d = new Date(date);
  switch (frequency) {
    case "daily":
      d.setDate(d.getDate() + 1);
      return d;
    case "weekly":
      d.setDate(d.getDate() + 7);
      return d;
    case "biweekly":
      d.setDate(d.getDate() + 14);
      return d;
    case "monthly":
      return addMonthsClamped(d, 1);
    case "yearly":
      return addMonthsClamped(d, 12);
  }
}

/** Advances a full "YYYY-MM-DDTHH:MM:SS" local datetime string (Events' date_time) by one interval. */
export function advanceEventDateTime(dateTimeIso: string, frequency: RecurrenceFrequency): string {
  return formatDateTimeLocal(addInterval(new Date(dateTimeIso), frequency));
}

/** Advances a date-only "YYYY-MM-DD" string (Tasks' due_date) by one interval, parsed as a local date to avoid the UTC-midnight parsing pitfall of `new Date("YYYY-MM-DD")`. */
export function advanceTaskDueDate(dueDateIso: string, frequency: RecurrenceFrequency): string {
  const [y, m, d] = dueDateIso.split("-").map(Number) as [number, number, number];
  return formatDateOnly(addInterval(new Date(y, m - 1, d), frequency));
}

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  date_time: string;
  created_by: string;
  visibility: "public" | "private";
  category: string | null;
  reminder_lead_time: string | null;
  recurrence_id: string | null;
  recurrence_frequency: RecurrenceFrequency | null;
}

/** Tops up one Event series up to `windowEndIso`, copying every field but the date from the latest existing occurrence. Returns how many were created. Safety-capped so a bug can't spin this into an infinite loop. */
export function topUpEventSeries(recurrenceId: string, windowEndIso: string): number {
  const db = getDb();
  let created = 0;

  for (let i = 0; i < 500; i++) {
    const latest = db
      .prepare(`SELECT * FROM events WHERE recurrence_id = ? ORDER BY date_time DESC LIMIT 1`)
      .get(recurrenceId) as EventRow | undefined;
    if (!latest || !latest.recurrence_frequency) return created;

    const next = advanceEventDateTime(latest.date_time, latest.recurrence_frequency);
    if (next > windowEndIso) return created;

    const untilRow = db
      .prepare(`SELECT MIN(recurrence_until) as until FROM events WHERE recurrence_id = ? AND recurrence_until IS NOT NULL`)
      .get(recurrenceId) as { until: string | null };
    if (untilRow.until && next >= untilRow.until) return created;

    const id = randomUUID();
    db.prepare(
      `INSERT INTO events (id, title, description, date_time, created_by, visibility, category, reminder_lead_time, recurrence_id, recurrence_frequency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      latest.title,
      latest.description,
      next,
      latest.created_by,
      latest.visibility,
      latest.category,
      latest.reminder_lead_time,
      recurrenceId,
      latest.recurrence_frequency
    );

    const assignees = db.prepare(`SELECT user_id FROM event_assignments WHERE event_id = ?`).all(latest.id) as {
      user_id: string;
    }[];
    const insertAssignment = db.prepare(`INSERT INTO event_assignments (event_id, user_id) VALUES (?, ?)`);
    for (const a of assignees) insertAssignment.run(id, a.user_id);

    created++;
  }
  return created;
}

/** The rolling-window boundary for Event occurrence generation, as a local "YYYY-MM-DDTHH:MM:SS" string — shared by the scheduler's broad top-up and the immediate top-up right after creating a new recurring Event, so both agree on exactly the same cutoff. */
export function eventRecurrenceWindowEnd(now: Date = new Date()): string {
  const windowEnd = new Date(now);
  windowEnd.setMonth(windowEnd.getMonth() + WINDOW_MONTHS);
  return formatDateTimeLocal(windowEnd);
}

/** Same as `eventRecurrenceWindowEnd`, for Tasks' date-only due_date. */
export function taskRecurrenceWindowEnd(now: Date = new Date()): string {
  const windowEnd = new Date(now);
  windowEnd.setMonth(windowEnd.getMonth() + WINDOW_MONTHS);
  return formatDateOnly(windowEnd);
}

/** Tops up every active Event series to `WINDOW_MONTHS` ahead of `now`. Called periodically by scripts/scheduler-hourly.ts. */
export function generateUpcomingEventOccurrences(now: Date = new Date()): number {
  const db = getDb();
  const windowEndIso = eventRecurrenceWindowEnd(now);

  const seriesIds = db
    .prepare(`SELECT DISTINCT recurrence_id FROM events WHERE recurrence_id IS NOT NULL AND recurrence_frequency IS NOT NULL`)
    .all() as { recurrence_id: string }[];

  let created = 0;
  for (const { recurrence_id } of seriesIds) created += topUpEventSeries(recurrence_id, windowEndIso);
  return created;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  owner_id: string;
  due_date: string | null;
  created_by: string;
  assigned_by: string;
  visibility: "public" | "private";
  recurrence_id: string | null;
  recurrence_frequency: RecurrenceFrequency | null;
}

/** Tops up one Task series up to `windowEndIso` (a YYYY-MM-DD date). Every new occurrence starts fresh at status 'not_done' — completing one instance has no bearing on the next. */
export function topUpTaskSeries(recurrenceId: string, windowEndIso: string): number {
  const db = getDb();
  let created = 0;

  for (let i = 0; i < 500; i++) {
    const latest = db
      .prepare(`SELECT * FROM tasks WHERE recurrence_id = ? ORDER BY due_date DESC LIMIT 1`)
      .get(recurrenceId) as TaskRow | undefined;
    if (!latest || !latest.recurrence_frequency || !latest.due_date) return created;

    const next = advanceTaskDueDate(latest.due_date, latest.recurrence_frequency);
    if (next > windowEndIso) return created;

    const untilRow = db
      .prepare(`SELECT MIN(recurrence_until) as until FROM tasks WHERE recurrence_id = ? AND recurrence_until IS NOT NULL`)
      .get(recurrenceId) as { until: string | null };
    if (untilRow.until && next >= untilRow.until) return created;

    const id = randomUUID();
    db.prepare(
      `INSERT INTO tasks (id, title, description, owner_id, due_date, status, created_by, assigned_by, visibility, recurrence_id, recurrence_frequency)
       VALUES (?, ?, ?, ?, ?, 'not_done', ?, ?, ?, ?, ?)`
    ).run(
      id,
      latest.title,
      latest.description,
      latest.owner_id,
      next,
      latest.created_by,
      latest.assigned_by,
      latest.visibility,
      recurrenceId,
      latest.recurrence_frequency
    );

    created++;
  }
  return created;
}

/** Tops up every active Task series to `WINDOW_MONTHS` ahead of `now`. Called periodically by scripts/scheduler-hourly.ts. */
export function generateUpcomingTaskOccurrences(now: Date = new Date()): number {
  const db = getDb();
  const windowEndIso = taskRecurrenceWindowEnd(now);

  const seriesIds = db
    .prepare(`SELECT DISTINCT recurrence_id FROM tasks WHERE recurrence_id IS NOT NULL AND recurrence_frequency IS NOT NULL`)
    .all() as { recurrence_id: string }[];

  let created = 0;
  for (const { recurrence_id } of seriesIds) created += topUpTaskSeries(recurrence_id, windowEndIso);
  return created;
}
