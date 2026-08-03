// Tracks when each scheduled agent last ran, using the ai_interaction log
// entries logAiInteraction already writes — no separate "last run" table
// needed. Backs scripts/scheduler-hourly.ts's due-check for Guardian's daily
// check (Guardian.md) and Advisor's weekly check (Advisor.md).

import { getDb } from "@/db/client";

export function getLastAgentRunAt(agent: "guardian" | "advisor"): string | null {
  const row = getDb()
    .prepare(
      `SELECT created_at FROM security_events
       WHERE type = 'ai_interaction' AND json_extract(detail, '$.agent') = ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(agent) as { created_at: string } | undefined;
  return row?.created_at ?? null;
}

/** Per-user due-check for memory-extraction.ts's daily pass — unlike Guardian/Advisor, this cadence is per-user, not household-wide. */
export function getLastMemoryExtractionAt(userId: string): string | null {
  const row = getDb()
    .prepare(
      `SELECT created_at FROM security_events
       WHERE type = 'ai_interaction' AND user_id = ? AND json_extract(detail, '$.memoryExtraction') = 1
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(userId) as { created_at: string } | undefined;
  return row?.created_at ?? null;
}

export function hoursSince(isoTimestamp: string, now: Date = new Date()): number {
  return (now.getTime() - new Date(isoTimestamp).getTime()) / (1000 * 60 * 60);
}
