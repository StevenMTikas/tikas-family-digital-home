// Failed-login lockout for the external_viewer login surface only
// (app/api/family-view/auth/login) — see Security_Architecture.md's Funnel
// section. The internal /login route deliberately keeps Authentication.md's
// documented "no lockouts" MVP behavior, since it's reachable only from the
// trusted tailnet; this is the minimum bar for a route reachable from the
// open internet.
//
// Reuses the existing security_events table (no new table needed) — counts
// recent login_failed rows for the attempted username.
//
// Note: security_events.created_at can be either SQLite's own
// space-separated `datetime('now')` default or an explicitly-set ISO 8601
// string (see db/schema.sql's messages.created_at comment for the exact bug
// class this is guarding against) — comparing those two formats as plain
// strings gives wrong answers. julianday() parses both formats correctly, so
// the window check below uses that instead of a lexicographic `created_at > ?`.

import type Database from "better-sqlite3";

const FAILED_ATTEMPT_THRESHOLD = 5;
const WINDOW_MINUTES = 15;

export interface ThrottleResult {
  locked: boolean;
  retryAfterSeconds?: number;
}

export function checkLoginThrottle(db: Database.Database, username: string, now: Date = new Date()): ThrottleResult {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM security_events
       WHERE type = 'login_failed'
         AND json_extract(detail, '$.username') = ?
         AND julianday(created_at) > julianday(?, '-${WINDOW_MINUTES} minutes')`
    )
    .get(username, now.toISOString()) as { c: number };

  if (row.c >= FAILED_ATTEMPT_THRESHOLD) {
    return { locked: true, retryAfterSeconds: WINDOW_MINUTES * 60 };
  }
  return { locked: false };
}
