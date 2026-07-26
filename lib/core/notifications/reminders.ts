// Reminder-firing scheduler job — Calendar.md/Tasks.md's "real-time
// reminders" delivered through the standard Notification path. Runs every
// scheduler tick (see instrumentation-node.ts) rather than on a daily/weekly
// gate like Guardian/Advisor, since a reminder is due at a specific moment,
// not once a day — idempotency comes from each row's own `reminder_sent_at`,
// the same pattern already used for Advisor's `expireStaleSuggestions()`.

import { getDb } from "@/db/client";
import { createNotification } from "./index";

// Mirrors app/calendar/CalendarPageClient.tsx's fixed REMINDER_OPTIONS list —
// a free-text field by design (Calendar.md's Add/Edit Event form), parsed
// here rather than normalized in the DB.
function parseLeadMinutes(leadTime: string): number | null {
  const match = leadTime.match(/^(\d+)\s+(minute|minutes|hour|hours|day|days)\s+before$/i);
  if (!match) return null;
  const amount = parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  if (unit.startsWith("minute")) return amount;
  if (unit.startsWith("hour")) return amount * 60;
  return amount * 60 * 24;
}

interface EventRow {
  id: string;
  title: string;
  date_time: string;
  reminder_lead_time: string;
}

interface TaskRow {
  id: string;
  title: string;
  due_date: string;
  owner_id: string;
  assigned_by: string;
}

/**
 * Fires due Event and Task reminders as Notifications, marking each row's
 * `reminder_sent_at` so it never fires twice.
 *
 * Deliberately does the "is this due yet" comparison in JS on parsed `Date`
 * objects rather than as a SQL string range — `events.date_time` is stored
 * as whatever the Calendar form's date/time inputs produced (a naive
 * local-clock string, no UTC offset), while a `now`/`soon` bound would
 * naturally be built via `.toISOString()` (UTC, with a trailing `Z`).
 * Comparing those two string shapes lexicographically silently produces
 * wrong answers near format boundaries (e.g. "11:..." vs "15:...Z" compares
 * as "11" < "15" as *strings* even when they're the same real moment in
 * different notations) — `new Date(x).getTime()` sidesteps the whole
 * problem, correctly reconstructing the intended moment either way (a
 * self-hosted single-household deployment means the server's local timezone
 * already matches the family's, so a naive local string parses correctly as
 * local time on this same machine).
 */
export async function checkAndFireReminders(now: Date = new Date()): Promise<{ events: number; tasks: number }> {
  const db = getDb();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();
  let eventsFired = 0;
  let tasksFired = 0;

  const candidateEvents = db
    .prepare(`SELECT id, title, date_time, reminder_lead_time FROM events WHERE reminder_lead_time IS NOT NULL AND reminder_sent_at IS NULL`)
    .all() as EventRow[];

  for (const event of candidateEvents) {
    const leadMinutes = parseLeadMinutes(event.reminder_lead_time);
    if (leadMinutes === null) continue;

    const eventMs = new Date(event.date_time).getTime();
    if (Number.isNaN(eventMs) || eventMs <= nowMs) continue; // already happened (or unparseable) — nothing to remind about
    const fireAtMs = eventMs - leadMinutes * 60 * 1000;
    if (fireAtMs > nowMs) continue; // lead time hasn't arrived yet

    const assigneeIds = (
      db.prepare(`SELECT user_id FROM event_assignments WHERE event_id = ?`).all(event.id) as { user_id: string }[]
    ).map((r) => r.user_id);

    for (const userId of assigneeIds) {
      await createNotification({ userId, text: `Reminder: "${event.title}" is coming up.`, relatedEventId: event.id });
    }
    db.prepare(`UPDATE events SET reminder_sent_at = ? WHERE id = ?`).run(nowIso, event.id);
    eventsFired += 1;
  }

  // Tasks.md: reminders are due-date based (no lead-time field on Task) —
  // fires once the due date has arrived, for tasks not yet completed.
  const candidateTasks = db
    .prepare(`SELECT id, title, due_date, owner_id, assigned_by FROM tasks WHERE reminder_sent_at IS NULL AND status = 'not_done' AND due_date IS NOT NULL`)
    .all() as TaskRow[];

  for (const task of candidateTasks) {
    const dueMs = new Date(task.due_date).getTime();
    if (Number.isNaN(dueMs) || dueMs > nowMs) continue; // not due yet

    const recipients = new Set([task.owner_id, task.assigned_by]);
    for (const userId of recipients) {
      await createNotification({ userId, text: `"${task.title}" is due.`, relatedTaskId: task.id });
    }
    db.prepare(`UPDATE tasks SET reminder_sent_at = ? WHERE id = ?`).run(nowIso, task.id);
    tasksFired += 1;
  }

  return { events: eventsFired, tasks: tasksFired };
}
