// Shared Notification delivery — the single place every notification source
// (Guardian, Advisor, Calendar/Task reminders) routes through, per
// Notifications.md: "one unified system, all sources." Handles the MVP
// "last 10, hard delete beyond that" cap and Web Push delivery so no caller
// has to reimplement either.

import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import { getDb } from "@/db/client";
import { sendPushToUser } from "@/lib/core/push";

const RECENT_LIMIT = 10; // Notifications.md: "last 10... oldest are removed entirely"

// In-process pub/sub backing the SSE stream (app/api/notifications/stream) —
// Notifications.md's "real-time, in-app delivery" requirement. Works because
// this is a single self-hosted Node process (Decision_Log.md #001), not a
// multi-instance deployment — one event name per user id.
export const notificationEvents = new EventEmitter();
notificationEvents.setMaxListeners(50); // a handful of devices per family member, well under Node's default warning threshold

export interface CreateNotificationInput {
  userId: string;
  text: string;
  severity?: "routine" | "urgent";
  relatedSuggestionId?: string;
  relatedEventId?: string;
  relatedTaskId?: string;
}

export interface NotificationRecord {
  id: string;
  text: string;
  createdAt: string;
  severity: "routine" | "urgent";
  relatedSuggestionId: string | null;
  relatedEventId: string | null;
  relatedTaskId: string | null;
  liked: boolean | null;
}

/** Creates a notification, enforces the last-10 cap for that user, and pushes it — per Notifications.md. */
export async function createNotification(input: CreateNotificationInput): Promise<string> {
  const db = getDb();
  const id = randomUUID();
  const severity = input.severity ?? "routine";

  db.prepare(
    `INSERT INTO notifications (id, user_id, text, severity, related_suggestion_id, related_event_id, related_task_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.userId, input.text, severity, input.relatedSuggestionId ?? null, input.relatedEventId ?? null, input.relatedTaskId ?? null);

  // Hard delete beyond the cap — "not retained anywhere," not a soft-archive.
  const overflow = db
    .prepare(
      `SELECT id FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET ?`
    )
    .all(input.userId, RECENT_LIMIT) as { id: string }[];
  if (overflow.length > 0) {
    const placeholders = overflow.map(() => "?").join(",");
    db.prepare(`DELETE FROM notifications WHERE id IN (${placeholders})`).run(...overflow.map((r) => r.id));
  }

  const row = db.prepare(`SELECT created_at FROM notifications WHERE id = ?`).get(id) as { created_at: string };
  const record: NotificationRecord = {
    id,
    text: input.text,
    createdAt: row.created_at,
    severity,
    relatedSuggestionId: input.relatedSuggestionId ?? null,
    relatedEventId: input.relatedEventId ?? null,
    relatedTaskId: input.relatedTaskId ?? null,
    liked: null,
  };

  // Real-time in-app delivery (Notifications.md) — a no-op if the user has
  // no open SSE connection right now, same "not an error" reasoning as push below.
  notificationEvents.emit(input.userId, record);

  // Push delivery shouldn't block or fail notification creation — a user
  // with no subscriptions yet (or a dead one) is a normal, non-error case.
  sendPushToUser(input.userId, { id, text: input.text, severity, url: routeFor(input) }).catch((err) => {
    console.error("[notifications] Push delivery failed:", err);
  });

  return id;
}

function routeFor(input: CreateNotificationInput): string {
  if (input.relatedSuggestionId) return "/ai-settings";
  if (input.relatedEventId) return "/calendar";
  if (input.relatedTaskId) return "/tasks";
  return "/administration";
}

interface NotificationRow {
  id: string;
  text: string;
  created_at: string;
  severity: "routine" | "urgent";
  related_suggestion_id: string | null;
  related_event_id: string | null;
  related_task_id: string | null;
  liked: number | null;
}

/** The last (up to) 10 notifications for a user, most recent first — Notifications.md's capped recent list. */
export function getRecentNotifications(userId: string): NotificationRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT id, text, created_at, severity, related_suggestion_id, related_event_id, related_task_id, liked
       FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`
    )
    .all(userId, RECENT_LIMIT) as NotificationRow[];

  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    createdAt: row.created_at,
    severity: row.severity,
    relatedSuggestionId: row.related_suggestion_id,
    relatedEventId: row.related_event_id,
    relatedTaskId: row.related_task_id,
    liked: row.liked === null ? null : !!row.liked,
  }));
}
