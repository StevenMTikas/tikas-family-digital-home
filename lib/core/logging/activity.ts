// A scoped Admin's view of one child's activity — the capability behind the
// `view_child_activity_logs` permission (Authorization.md), distinct from the
// Super-Admin-only full security log (Logs.md, app/api/admin/logs).
//
// Deliberately an ALLOWLIST of event types, not "everything for this user":
// - ai_interaction is excluded — Assistant conversations stay private to the
//   child, apart from Guardian's narrow, explicitly-documented safety signal.
// - device_* and permission_changed are excluded — those are logged against
//   the acting Admin, not the child, so they aren't the child's activity.
// - location is not in security_events at all, and stays Super Admin only
//   (Location_Tracking.md).

import { getDb } from "@/db/client";
import { hasAdminAuthorityOver, hasPermission, type AuthUser } from "@/lib/core/permissions";
import type { LogEventType } from "@/lib/core/logging";

export const ACTIVITY_EVENT_LABELS: Partial<Record<LogEventType, string>> = {
  login: "Logged in",
  logout: "Logged out",
  login_failed: "Failed login",
  outside_call_approved: "Outside call approved",
  outside_call_denied: "Outside call declined",
  outside_call_blocked: "Outside call blocked",
  password_viewed: "Viewed a saved password",
  document_uploaded: "Uploaded a document",
  document_downloaded: "Downloaded a document",
  document_deleted: "Deleted a document",
  family_knowledge_item_deleted: "Deleted a Family Knowledge item",
};

const ACTIVITY_EVENT_TYPES = Object.keys(ACTIVITY_EVENT_LABELS) as LogEventType[];

export interface ActivityEntry {
  id: string;
  type: string;
  label: string;
  summary: string | null;
  createdAt: string;
}

/**
 * Can `actor` read `targetUserId`'s activity? Super Admin, or an Admin scoped
 * to that user who also holds the individually grantable permission. Never
 * the actor's own activity — this is the oversight view, not a self-service one.
 */
export function canViewActivityOf(actor: AuthUser, targetUserId: string): boolean {
  if (actor.id === targetUserId) return false;
  return hasAdminAuthorityOver(actor, targetUserId) && hasPermission(actor, "viewChildActivityLogs");
}

export function getViewableActivityTargets(actor: AuthUser): { id: string; fullName: string }[] {
  if (actor.role === "super_admin") {
    const rows = getDb()
      .prepare(`SELECT id, full_name FROM users WHERE id != ? AND role != 'external_viewer' ORDER BY full_name`)
      .all(actor.id) as { id: string; full_name: string }[];
    return rows.map((r) => ({ id: r.id, fullName: r.full_name }));
  }
  if (actor.role === "admin" && hasPermission(actor, "viewChildActivityLogs") && actor.adminScope.length > 0) {
    const placeholders = actor.adminScope.map(() => "?").join(",");
    const rows = getDb()
      .prepare(`SELECT id, full_name FROM users WHERE id IN (${placeholders}) ORDER BY full_name`)
      .all(...actor.adminScope) as { id: string; full_name: string }[];
    return rows.map((r) => ({ id: r.id, fullName: r.full_name }));
  }
  return [];
}

// One short human line per event — never the raw detail JSON, so a field
// added to some event's detail later doesn't silently start showing here.
function summarize(type: string, detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  switch (type) {
    case "document_uploaded":
    case "document_downloaded":
    case "document_deleted":
    case "family_knowledge_item_deleted":
      return str(detail.title);
    case "password_viewed":
      return str(detail.serviceName);
    case "outside_call_approved":
    case "outside_call_denied":
    case "outside_call_blocked":
      return str(detail.payloadDescription);
    default:
      return null;
  }
}

// security_events.created_at defaults to datetime('now'): UTC, but written
// without a zone marker — normalised here so the browser doesn't read it as local time.
function toIso(createdAt: string): string {
  return createdAt.includes("T") ? createdAt : `${createdAt.replace(" ", "T")}Z`;
}

/** Most recent first, within the 30-day retention window the log itself already enforces. */
export function getUserActivity(userId: string, limit = 200): ActivityEntry[] {
  const placeholders = ACTIVITY_EVENT_TYPES.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT id, type, detail, created_at FROM security_events
       WHERE user_id = ? AND type IN (${placeholders})
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(userId, ...ACTIVITY_EVENT_TYPES, limit) as { id: string; type: string; detail: string | null; created_at: string }[];

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    label: ACTIVITY_EVENT_LABELS[r.type as LogEventType] ?? r.type,
    summary: summarize(r.type, r.detail ? JSON.parse(r.detail) : null),
    createdAt: toIso(r.created_at),
  }));
}
