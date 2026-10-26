// Location Tracking core service. See docs/02_Modules/Location_Tracking.md.
//
// Deliberately has no import anywhere under lib/core/ai/* — this module is
// the one data domain in the app the Assistant/Advisor/Guardian/frontier
// escalation path must never read. Keep it that way; see tools.ts's comment
// at the top of its tool-relevant-keyword list for the same warning from the
// other direction.

import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import type { ConnectorDevice } from "@/lib/core/connectors";
import type { AuthUser } from "@/lib/core/permissions";

const HISTORY_RETENTION_DAYS = 7;

export type ReportSource = "push_refresh" | "foreground" | "heartbeat";
export const REPORT_SOURCES: ReportSource[] = ["push_refresh", "foreground", "heartbeat"];

export interface LocationReportInput {
  latitude: number;
  longitude: number;
  accuracyM?: number;
  recordedAt: string;
  source?: ReportSource;
}

export function recordLocationReport(device: ConnectorDevice, input: LocationReportInput): void {
  getDb()
    .prepare(
      `INSERT INTO location_reports (id, user_id, device_id, latitude, longitude, accuracy_m, recorded_at, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      randomUUID(),
      device.userId,
      device.id,
      input.latitude,
      input.longitude,
      input.accuracyM ?? null,
      input.recordedAt,
      input.source ?? null
    );
}

/** Stores the phone's native FCM token so the host can wake it for an on-demand refresh. */
export function savePushToken(deviceId: string, token: string): void {
  getDb().prepare(`UPDATE devices SET push_token = ? WHERE id = ?`).run(token, deviceId);
}

export interface CurrentLocation {
  userId: string;
  fullName: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  recordedAt: string;
  /** null for readings written before sources were tracked. */
  source: ReportSource | null;
}

/**
 * Latest known position for every family member who currently has sharing
 * enabled. Not scoped to "everyone except me" — showing the viewer's own
 * latest reading too is harmless and simpler than special-casing it out.
 * Excludes external_viewer accounts entirely; this module isn't part of
 * that surface.
 */
export function getCurrentFamilyLocations(): CurrentLocation[] {
  const rows = getDb()
    .prepare(
      `SELECT u.id AS user_id, u.full_name,
              lr.latitude, lr.longitude, lr.accuracy_m, lr.recorded_at, lr.source
       FROM users u
       JOIN location_reports lr ON lr.id = (
         SELECT id FROM location_reports
         WHERE user_id = u.id
         ORDER BY recorded_at DESC
         LIMIT 1
       )
       WHERE u.role != 'external_viewer' AND u.location_sharing_enabled = 1
       ORDER BY u.full_name`
    )
    .all() as {
    user_id: string;
    full_name: string;
    latitude: number;
    longitude: number;
    accuracy_m: number | null;
    recorded_at: string;
    source: ReportSource | null;
  }[];

  return rows.map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    latitude: r.latitude,
    longitude: r.longitude,
    accuracyM: r.accuracy_m,
    recordedAt: r.recorded_at,
    source: r.source,
  }));
}

export interface LocationHistoryEntry {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  recordedAt: string;
}

/**
 * The last 7 days of readings for one user, most recent first. Callers MUST
 * check `role === 'super_admin'` before calling this — see
 * Location_Tracking.md's Permissions section; this function itself doesn't
 * take an actor, since the check is a plain role check with no per-user
 * scoping to compute.
 */
export function getLocationHistory(userId: string): LocationHistoryEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT latitude, longitude, accuracy_m, recorded_at
       FROM location_reports
       WHERE user_id = ?
       ORDER BY recorded_at DESC`
    )
    .all(userId) as { latitude: number; longitude: number; accuracy_m: number | null; recorded_at: string }[];

  return rows.map((r) => ({
    latitude: r.latitude,
    longitude: r.longitude,
    accuracyM: r.accuracy_m,
    recordedAt: r.recorded_at,
  }));
}

/** Hard delete past the 7-day window, keyed off received_at so a phone's clock skew can't extend its own retention. */
export function purgeOldLocationReports(now: Date = new Date()): number {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS);

  const result = getDb().prepare(`DELETE FROM location_reports WHERE received_at < ?`).run(cutoff.toISOString());
  return result.changes;
}

/**
 * A minor's account can never turn location sharing off — computed live from
 * date_of_birth rather than a stored flag, so it can't drift from reality.
 * Matches the existing project convention (see schema.sql's
 * approve_sensitive_outside_transmission comment) of computing minor status
 * rather than trusting a cached boolean.
 */
export function isMinor(dateOfBirth: string | null, now: Date = new Date()): boolean {
  if (!dateOfBirth) return false;
  const dob = new Date(dateOfBirth);
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age--;
  return age < 18;
}

export function getLocationSharingEnabled(userId: string): boolean {
  const row = getDb().prepare(`SELECT location_sharing_enabled FROM users WHERE id = ?`).get(userId) as
    | { location_sharing_enabled: number }
    | undefined;
  return !!row?.location_sharing_enabled;
}

/** Returns null on success, or an error reason if the actor isn't allowed to change this. */
export function setLocationSharingEnabled(actor: AuthUser, enabled: boolean): "minor_cannot_opt_out" | null {
  const row = getDb().prepare(`SELECT date_of_birth FROM users WHERE id = ?`).get(actor.id) as
    | { date_of_birth: string | null }
    | undefined;

  if (!enabled && isMinor(row?.date_of_birth ?? null)) {
    return "minor_cannot_opt_out";
  }

  getDb().prepare(`UPDATE users SET location_sharing_enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, actor.id);
  return null;
}
