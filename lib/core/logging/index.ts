// Shared security/event logging service — the single place security events
// get recorded (logins, permission changes, device changes, outside-call
// approvals/denials, blocked attempts).
// See docs/01_System_Architecture/Security_Architecture.md ("Security Event
// Logging") and docs/06_Admin/Logs.md (30-day retention for MVP).

import { randomUUID } from "crypto";
import { getDb } from "@/db/client";

export type LogEventType =
  | "login"
  | "login_failed"
  | "password_reset"
  | "device_added"
  | "device_revoked"
  | "permission_changed"
  | "outside_call_approved"
  | "outside_call_denied"
  | "outside_call_blocked";

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
