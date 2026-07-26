// Guardian: background, scheduled monitoring — system health, security
// events, and fact-only family-usage patterns. See docs/05_AI/Guardian.md.
//
// Connector sync monitoring (Guardian.md's fourth System Health item) isn't
// checked here — there's no real file-connector sync yet (Phase 5, not
// built). Disk space, device "last synced" staleness, and (as of Phase 4)
// backup status ARE checked below.
//
// Alongside routing findings to notifications/suggestions, each run also
// records a structured `health` snapshot in its own ai_interaction log entry
// (see logAiInteraction call below) — this is what Administration's
// Monitoring/Overview tabs read (Monitoring.md: "displays the results of
// Guardian's existing scheduled monitoring pass... reuse the same
// logging/event data rather than introducing a new entity").

import { randomUUID } from "crypto";
import { statfsSync } from "fs";
import { getDb } from "@/db/client";
import { ollamaChat } from "./ollama";
import { getModelForRole, logAiInteraction } from "./index";
import { getBaseLayerPrompt } from "./base-layer";
import { GUARDIAN_ROLE_PROMPT } from "./roles";
import { getLastBackup } from "@/lib/core/backup";
import { createNotification } from "@/lib/core/notifications";

export type GuardianChannel = "passive" | "urgent" | "advisor";

export interface GuardianFinding {
  rawFinding: string;
  channel: GuardianChannel;
  // Only set for "advisor" channel findings — who the resulting suggestion targets.
  targetUserId?: string;
}

const DISK_URGENT_THRESHOLD = 0.1; // per Guardian.md's example: "disk nearly full"
const STALE_DEVICE_DAYS = 7;
const INACTIVE_ACCOUNT_DAYS = 5; // matches Guardian.md's own example ("hasn't been opened in 5 days")

function getDiskFreeRatio(): number | null {
  try {
    const stats = statfsSync(process.cwd());
    return stats.bavail / stats.blocks;
  } catch {
    return null;
  }
}

function checkDiskSpace(): GuardianFinding[] {
  const freeRatio = getDiskFreeRatio();
  if (freeRatio !== null && freeRatio < DISK_URGENT_THRESHOLD) {
    return [
      {
        rawFinding: `Disk space is low: only ${(freeRatio * 100).toFixed(1)}% free.`,
        channel: "urgent",
      },
    ];
  }
  return [];
}

function getStaleDevices(now: Date): { device_name: string }[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - STALE_DEVICE_DAYS);

  return getDb()
    .prepare(
      `SELECT device_name FROM devices
       WHERE status = 'trusted' AND last_sync_at IS NULL AND added_at < ?`
    )
    .all(cutoff.toISOString()) as { device_name: string }[];
}

function checkStaleDevices(now: Date): GuardianFinding[] {
  return getStaleDevices(now).map((row) => ({
    rawFinding: `The device "${row.device_name}" has never synced since being trusted more than ${STALE_DEVICE_DAYS} days ago.`,
    channel: "passive" as const,
  }));
}

function checkFailedLogins(now: Date): GuardianFinding[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 1);

  const row = getDb()
    .prepare(`SELECT COUNT(*) as count FROM security_events WHERE type = 'login_failed' AND created_at >= ?`)
    .get(cutoff.toISOString()) as { count: number };

  if (row.count === 0) return [];
  return [
    {
      rawFinding: `There ${row.count === 1 ? "was" : "were"} ${row.count} failed login attempt${row.count === 1 ? "" : "s"} in the last 24 hours.`,
      channel: "passive",
    },
  ];
}

function checkInactiveAccounts(now: Date): GuardianFinding[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - INACTIVE_ACCOUNT_DAYS);
  const db = getDb();

  const users = db.prepare(`SELECT id, full_name FROM users`).all() as { id: string; full_name: string }[];
  const findings: GuardianFinding[] = [];

  for (const user of users) {
    const lastLogin = db
      .prepare(`SELECT created_at FROM security_events WHERE type = 'login' AND user_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(user.id) as { created_at: string } | undefined;

    if (lastLogin && lastLogin.created_at < cutoff.toISOString()) {
      findings.push({
        rawFinding: `${user.full_name}'s account hasn't been opened in at least ${INACTIVE_ACCOUNT_DAYS} days.`,
        channel: "passive",
      });
    }
  }
  return findings;
}

export function detectGuardianFindings(now: Date = new Date()): GuardianFinding[] {
  return [...checkDiskSpace(), ...checkStaleDevices(now), ...checkFailedLogins(now), ...checkInactiveAccounts(now)];
}

async function phraseFinding(finding: GuardianFinding): Promise<string> {
  const model = getModelForRole("guardian");
  const messages = [
    { role: "system" as const, content: [getBaseLayerPrompt(), "", GUARDIAN_ROLE_PROMPT].join("\n") },
    { role: "user" as const, content: finding.rawFinding },
  ];
  const reply = await ollamaChat(model, messages);
  return reply.content.trim();
}

function getSuperAdminId(): string | null {
  const row = getDb().prepare(`SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`).get() as
    | { id: string }
    | undefined;
  return row?.id ?? null;
}

export interface SystemHealthSnapshot {
  diskSpace: { status: "ok" | "urgent"; freeRatio: number | null };
  deviceConnectivity: { status: "ok" | "issue"; staleDeviceCount: number };
  backup: { status: "ok" | "issue" | "unknown"; lastBackupAt: string | null; lastBackupStatus: "success" | "failed" | null };
}

/** Builds the per-category health snapshot Administration's Monitoring/Overview tabs display — see file header. */
export async function computeHealthSnapshot(now: Date = new Date()): Promise<SystemHealthSnapshot> {
  const freeRatio = getDiskFreeRatio();
  const staleDeviceCount = getStaleDevices(now).length;
  const lastBackup = await getLastBackup();

  return {
    diskSpace: {
      status: freeRatio !== null && freeRatio < DISK_URGENT_THRESHOLD ? "urgent" : "ok",
      freeRatio,
    },
    deviceConnectivity: {
      status: staleDeviceCount > 0 ? "issue" : "ok",
      staleDeviceCount,
    },
    backup: {
      status: !lastBackup ? "unknown" : lastBackup.status === "success" ? "ok" : "issue",
      lastBackupAt: lastBackup?.createdAt ?? null,
      lastBackupStatus: lastBackup?.status ?? null,
    },
  };
}

/**
 * Reads the most recent Guardian run's logged health snapshot + timestamp —
 * what "Last checked: [timestamp]" on the Monitoring screen refers to. Falls
 * back to a live computation (with no "last checked" time) if Guardian
 * hasn't run yet, e.g. on a brand-new install.
 */
export async function getLatestHealthSnapshot(): Promise<{ checkedAt: string | null; health: SystemHealthSnapshot }> {
  const row = getDb()
    .prepare(
      `SELECT created_at, detail FROM security_events
       WHERE type = 'ai_interaction' AND json_extract(detail, '$.agent') = 'guardian'
       ORDER BY created_at DESC LIMIT 1`
    )
    .get() as { created_at: string; detail: string } | undefined;

  if (row) {
    const detail = JSON.parse(row.detail) as { health?: SystemHealthSnapshot };
    if (detail.health) return { checkedAt: row.created_at, health: detail.health };
  }

  return { checkedAt: null, health: await computeHealthSnapshot() };
}

/**
 * Runs Guardian's checks and routes each finding to one of the three
 * channels (Guardian.md). Passive/urgent findings become Notification rows
 * for the Super Admin — the Admin Dashboard (Phase 4) will read from the
 * same table once built. Advisor handoffs become AI_Suggestion rows.
 */
export async function runGuardianCheck(): Promise<{ passive: number; urgent: number; advisorHandoffs: number }> {
  const findings = detectGuardianFindings();
  const superAdminId = getSuperAdminId();
  const db = getDb();

  let passive = 0;
  let urgent = 0;
  let advisorHandoffs = 0;

  for (const finding of findings) {
    const text = await phraseFinding(finding);

    if (finding.channel === "advisor" && finding.targetUserId) {
      db.prepare(
        `INSERT INTO ai_suggestions (id, user_id, module, trigger_type, display_context, content)
         VALUES (?, ?, 'guardian', 'event', 'dashboard', ?)`
      ).run(randomUUID(), finding.targetUserId, text);
      advisorHandoffs += 1;
      continue;
    }

    if (!superAdminId) continue;
    await createNotification({ userId: superAdminId, text, severity: finding.channel === "urgent" ? "urgent" : "routine" });
    if (finding.channel === "urgent") urgent += 1;
    else passive += 1;
  }

  const health = await computeHealthSnapshot();

  // Guardian has no requesting user (AI_Permissions.md: "not tied to a
  // requesting user") — empty string stores NULL, same reasoning as Advisor's log above.
  await logAiInteraction("guardian", "", { findingsCount: findings.length, passive, urgent, advisorHandoffs, health });
  return { passive, urgent, advisorHandoffs };
}
