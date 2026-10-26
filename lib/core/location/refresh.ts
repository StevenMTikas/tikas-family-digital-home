// On-demand location refresh: wakes family members' phones with a push so
// /location can show a fresh position without any continuous background
// tracking. See docs/02_Modules/Location_Tracking.md ("Direction chosen").
//
// Like the rest of lib/core/location, nothing here may import from
// lib/core/ai/*.

import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { sendFcmDataPush, isFcmConfigured, type PushSender } from "./fcm";

/** A reading older than this triggers an automatic refresh when /location is opened. */
export const STALE_AFTER_MS = 3 * 60_000;
/** At most one refresh push per phone per this window, however often pages are opened. */
export const MIN_PUSH_GAP_MS = 60_000;

export interface RefreshOptions {
  /** Refresh only this family member (the manual per-person button). */
  onlyUserId?: string;
  /** Skip the staleness check (manual refresh). The per-phone rate limit still applies. */
  force?: boolean;
}

export interface RefreshDeps {
  send?: PushSender;
  now?: Date;
}

export interface RefreshResult {
  /** Users with at least one phone that was actually sent a push. */
  requested: string[];
  /** false when no FCM key is configured on this host — nothing can be sent. */
  configured: boolean;
}

interface CandidateRow {
  user_id: string;
  last_recorded_at: string | null;
}

interface PhoneRow {
  id: string;
  push_token: string;
  last_refresh_push_at: string | null;
}

/**
 * Sends a refresh push to every phone whose owner is sharing their location
 * and whose latest reading is stale (or all of them, if `force`). Never pushes
 * for a user with sharing turned off, never twice to one phone within
 * MIN_PUSH_GAP_MS, and forgets tokens FCM reports as dead.
 */
export async function requestLocationRefresh(options: RefreshOptions = {}, deps: RefreshDeps = {}): Promise<RefreshResult> {
  const send = deps.send ?? sendFcmDataPush;
  const now = deps.now ?? new Date();

  if (!deps.send && !isFcmConfigured()) return { requested: [], configured: false };

  const db = getDb();
  const candidates = db
    .prepare(
      `SELECT u.id AS user_id,
              (SELECT MAX(recorded_at) FROM location_reports WHERE user_id = u.id) AS last_recorded_at
       FROM users u
       WHERE u.role != 'external_viewer' AND u.location_sharing_enabled = 1
         ${options.onlyUserId ? "AND u.id = ?" : ""}`
    )
    .all(...(options.onlyUserId ? [options.onlyUserId] : [])) as CandidateRow[];

  const requested = new Set<string>();

  await Promise.all(
    candidates.map(async (candidate) => {
      const isStale =
        !candidate.last_recorded_at || now.getTime() - new Date(candidate.last_recorded_at).getTime() > STALE_AFTER_MS;
      if (!options.force && !isStale) return;

      const phones = db
        .prepare(
          `SELECT id, push_token, last_refresh_push_at FROM devices
           WHERE user_id = ? AND device_type = 'phone' AND status = 'trusted' AND push_token IS NOT NULL`
        )
        .all(candidate.user_id) as PhoneRow[];

      for (const phone of phones) {
        if (phone.last_refresh_push_at && now.getTime() - new Date(phone.last_refresh_push_at).getTime() < MIN_PUSH_GAP_MS) {
          continue;
        }

        const result = await send(phone.push_token, {
          type: "location_refresh",
          nonce: randomUUID().slice(0, 8),
          sentAt: now.toISOString(),
        });

        if (result === "sent") {
          db.prepare(`UPDATE devices SET last_refresh_push_at = ? WHERE id = ?`).run(now.toISOString(), phone.id);
          requested.add(candidate.user_id);
        } else if (result === "invalid_token") {
          db.prepare(`UPDATE devices SET push_token = NULL WHERE id = ?`).run(phone.id);
        }
      }
    })
  );

  return { requested: [...requested], configured: true };
}
