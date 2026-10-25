// Shared security/event logging service — the single place security events
// get recorded (logins, permission changes, device changes, outside-call
// approvals/denials, blocked attempts).
// See docs/01_System_Architecture/Security_Architecture.md ("Security Event
// Logging") and docs/06_Admin/Logs.md (30-day retention for MVP).

import { randomUUID } from "crypto";
import { getDb } from "@/db/client";

// Runtime-iterable source of truth for every event type — LogEventType is
// derived from this array (rather than a plain union) specifically so tests
// can enumerate it and check it against the admin Logs screen's hand-
// maintained EVENT_TYPE_LABELS/summarizeDetail maps, which TypeScript's own
// checker doesn't do (see lib/core/logging/index.test.ts) — confirmed this
// was a real, live gap: `logout`/`login_locked` were emitted but missing
// from EVENT_TYPE_LABELS until 2026-08-25.
export const LOG_EVENT_TYPES = [
  "login",
  "logout",
  "login_failed",
  // A run of login_failed events against the same username tripped the
  // throttle (lib/core/auth/throttle.ts) — external_viewer's /family-view
  // login only, per Security_Architecture.md's Funnel-exposure section.
  "login_locked",
  "password_reset",
  "device_added",
  "device_revoked",
  "permission_changed",
  "outside_call_approved",
  // Currently unreachable: requestOutsideCallApproval() (lib/core/ai/index.ts)
  // is a pure automatic permission-bit gate (approved or blocked) — there is
  // no interactive review UI anywhere yet where a human clicks "deny" before
  // a call goes out. Kept in the union (matches the admin Logs screen's
  // filter/label, which already expects it) rather than removed, since the
  // real fix is building that UI, not a logging change. See Future_Ideas.md.
  "outside_call_denied",
  "outside_call_blocked",
  // AI_Architecture.md: "Log every AI interaction through the shared
  // logging service" — one entry per agent run (Assistant reply, Advisor
  // suggestion generated, Guardian check), detail carries the agent + action.
  "ai_interaction",
  // Backup.md: restoring is a rare, destructive, Super-Admin-only action —
  // worth its own auditable entry, distinct from routine permission changes.
  "backup_restored",
  // The counterpart to backup_restored — a failed backup attempt (scheduled
  // or manual) is otherwise only visible in a local meta.json sidecar.
  "backup_failed",
  // Password Entry "reveal" (decrypt + return) — the single most sensitive
  // read action in the app; detail must never carry the password itself.
  "password_viewed",
  "document_uploaded",
  // The actual content-disclosure action for a Document.
  "document_downloaded",
  "document_deleted",
  "family_knowledge_item_deleted",
  // external_viewer role only — one entry per family-view page visit
  // (Photos gallery, Family Board), not per individual photo/post.
  "external_content_viewed",
] as const;

export type LogEventType = (typeof LOG_EVENT_TYPES)[number];

export interface LogEvent {
  type: LogEventType;
  // Empty string for events with no matching account (e.g. a failed login
  // against a username that doesn't exist) — put identifying detail in `detail` instead.
  userId: string;
  detail?: Record<string, unknown>;
}

/**
 * Records a security event. 30-day retention for MVP — see
 * docs/06_Admin/Logs.md for the purge policy this should implement.
 */
export async function logSecurityEvent(event: LogEvent): Promise<void> {
  const db = getDb();
  db.prepare(
    `INSERT INTO security_events (id, type, user_id, detail) VALUES (?, ?, ?, ?)`
  ).run(
    randomUUID(),
    event.type,
    event.userId || null,
    event.detail ? JSON.stringify(event.detail) : null
  );
}

const RETENTION_DAYS = 30; // Logs.md: "Log entries older than 30 days are purged automatically"

/** Deletes security events older than the retention window. Run daily from the scheduler (scripts/scheduler-hourly.ts). */
export async function purgeOldSecurityEvents(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const result = getDb()
    .prepare(`DELETE FROM security_events WHERE created_at < ?`)
    .run(cutoff.toISOString());
  return result.changes;
}
