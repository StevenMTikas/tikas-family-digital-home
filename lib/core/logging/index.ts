// Shared security/event logging service — the single place security events
// get recorded (logins, permission changes, device changes, outside-call
// approvals/denials, blocked attempts).
// See docs/01_System_Architecture/Security_Architecture.md ("Security Event
// Logging") and docs/06_Admin/Logs.md (30-day retention for MVP).

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
  userId: string;
  detail?: Record<string, unknown>;
}

/**
 * Records a security event. 30-day retention for MVP — see
 * docs/06_Admin/Logs.md for the purge policy this should implement.
 */
export async function logSecurityEvent(event: LogEvent): Promise<void> {
  throw new Error("Not implemented — see docs/01_System_Architecture/Security_Architecture.md");
}
