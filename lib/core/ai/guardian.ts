// Guardian: background, scheduled monitoring — system health, security
// events, and fact-only family-usage patterns. See docs/05_AI/Guardian.md.
//
// Backup status and connector sync monitoring (Guardian.md's other two
// System Health items) aren't checked here — there's no real backup system
// or file-connector sync yet (Phase 4/5, not built). Disk space and device
// "last synced" staleness ARE checked below since they're genuinely
// observable on this host right now, even ahead of that infrastructure.

import { randomUUID } from "crypto";
import { statfsSync } from "fs";
import { getDb } from "@/db/client";
import { ollamaChat } from "./ollama";
import { getModelForRole, logAiInteraction } from "./index";
import { getBaseLayerPrompt } from "./base-layer";
import { GUARDIAN_ROLE_PROMPT } from "./roles";

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

function checkDiskSpace(): GuardianFinding[] {
  try {
    const stats = statfsSync(process.cwd());
    const freeRatio = stats.bavail / stats.blocks;
    if (freeRatio < DISK_URGENT_THRESHOLD) {
      return [
        {
          rawFinding: `Disk space is low: only ${(freeRatio * 100).toFixed(1)}% free.`,
          channel: "urgent",
        },
      ];
    }
    return [];
  } catch {
    return [];
  }
}

function checkStaleDevices(now: Date): GuardianFinding[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - STALE_DEVICE_DAYS);

  const rows = getDb()
    .prepare(
      `SELECT device_name FROM devices
       WHERE status = 'trusted' AND last_sync_at IS NULL AND added_at < ?`
    )
    .all(cutoff.toISOString()) as { device_name: string }[];

  return rows.map((row) => ({
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
    db.prepare(
      `INSERT INTO notifications (id, user_id, text, severity) VALUES (?, ?, ?, ?)`
    ).run(randomUUID(), superAdminId, text, finding.channel === "urgent" ? "urgent" : "routine");
    if (finding.channel === "urgent") urgent += 1;
    else passive += 1;
  }

  // Guardian has no requesting user (AI_Permissions.md: "not tied to a
  // requesting user") — empty string stores NULL, same reasoning as Advisor's log above.
  await logAiInteraction("guardian", "", { findingsCount: findings.length, passive, urgent, advisorHandoffs });
  return { passive, urgent, advisorHandoffs };
}
