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
import { getLastAgentRunAt } from "./scheduler";
import { getLastBackup } from "@/lib/core/backup";
import { createNotification } from "@/lib/core/notifications";

export type GuardianChannel = "passive" | "urgent" | "advisor" | "safety";

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

// Narrow, explicit, low-recall-by-design keyword buckets — a missed real
// concern is preferable here to broad content-scanning of private
// conversations. Per explicit user direction (2026-08-01): reuse Guardian's
// existing fact-only, scheduled-check pattern (not real-time surveillance),
// and never quote the actual private message text in what gets sent out —
// only that a category matched, so a parent can go check in personally.
const SAFETY_KEYWORD_BUCKETS: { category: string; keywords: string[] }[] = [
  {
    category: "self-harm",
    keywords: ["kill myself", "want to die", "end my life", "suicide", "hurt myself", "self-harm", "self harm"],
  },
  {
    category: "abuse",
    keywords: ["hitting me", "hits me", "being abused", "abusing me", "not safe at home", "afraid of him", "afraid of her"],
  },
  {
    category: "danger",
    keywords: ["in danger", "someone is following me", "i'm scared of", "im scared of", "threatened me"],
  },
];

function findSafetyCategory(content: string): string | null {
  const lower = content.toLowerCase();
  for (const bucket of SAFETY_KEYWORD_BUCKETS) {
    if (bucket.keywords.some((keyword) => lower.includes(keyword))) return bucket.category;
  }
  return null;
}

interface SafetyMessageRow {
  user_id: string;
  full_name: string;
  content: string;
}

function checkConversationSafetySignals(sinceIso: string): GuardianFinding[] {
  const rows = getDb()
    .prepare(
      `SELECT c.user_id as user_id, u.full_name as full_name, m.content as content
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       JOIN users u ON u.id = c.user_id
       WHERE m.role = 'user' AND m.created_at > ?`
    )
    .all(sinceIso) as SafetyMessageRow[];

  // One finding per (user, category) per run, not one per matching message —
  // an ongoing concern shouldn't spam duplicate alerts within one window.
  const seen = new Set<string>();
  const findings: GuardianFinding[] = [];

  for (const row of rows) {
    const category = findSafetyCategory(row.content);
    if (!category) continue;
    const key = `${row.user_id}:${category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      rawFinding: `${row.full_name}'s recent Assistant conversation included language that may relate to ${category}. A parent may want to check in.`,
      channel: "safety",
      targetUserId: row.user_id,
    });
  }
  return findings;
}

export function detectGuardianFindings(now: Date = new Date(), since?: string): GuardianFinding[] {
  const safetyWindowStart = since ?? new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  return [
    ...checkDiskSpace(),
    ...checkStaleDevices(now),
    ...checkFailedLogins(now),
    ...checkInactiveAccounts(now),
    ...checkConversationSafetySignals(safetyWindowStart),
  ];
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

interface AdminRow {
  id: string;
  admin_scope: string | null;
  view_child_activity_logs: number;
}

/**
 * Who a safety finding about `targetUserId` should notify: the Super Admin
 * always, plus any Admin scoped to that user who's also individually been
 * granted "View Child Activity Logs" (Authorization.md) — reusing that
 * existing, previously-unwired permission as the gate, rather than making
 * bare admin_scope membership sufficient on its own.
 */
function getSafetyNotifyTargets(targetUserId: string): string[] {
  const superAdminId = getSuperAdminId();
  const admins = getDb()
    .prepare(`SELECT id, admin_scope, view_child_activity_logs FROM users WHERE role = 'admin'`)
    .all() as AdminRow[];

  const targets = new Set<string>();
  if (superAdminId) targets.add(superAdminId);
  for (const admin of admins) {
    const scope: string[] = admin.admin_scope ? JSON.parse(admin.admin_scope) : [];
    if (admin.view_child_activity_logs && scope.includes(targetUserId)) targets.add(admin.id);
  }
  return [...targets];
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
export async function runGuardianCheck(): Promise<{ passive: number; urgent: number; advisorHandoffs: number; safety: number }> {
  // Safety findings only scan messages since Guardian's own last run (or the
  // last 24h if it's never run) — otherwise the same already-flagged
  // conversation would generate a fresh alert on every single daily tick.
  const since = getLastAgentRunAt("guardian") ?? undefined;
  const findings = detectGuardianFindings(new Date(), since);
  const superAdminId = getSuperAdminId();
  const db = getDb();

  let passive = 0;
  let urgent = 0;
  let advisorHandoffs = 0;
  let safety = 0;

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

    if (finding.channel === "safety" && finding.targetUserId) {
      for (const targetId of getSafetyNotifyTargets(finding.targetUserId)) {
        await createNotification({ userId: targetId, text, severity: "urgent" });
      }
      safety += 1;
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
  await logAiInteraction("guardian", "", { findingsCount: findings.length, passive, urgent, advisorHandoffs, safety, health });
  return { passive, urgent, advisorHandoffs, safety };
}
