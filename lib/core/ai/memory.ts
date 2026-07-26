// AI_Memory — Tier 1 of the hybrid memory model (AI_Architecture.md): a
// lightweight, curated store of distilled per-user facts, checked before
// falling back to the full Data Model. See also AI_Memory.md (categories,
// decay, flagging).

import { randomUUID } from "crypto";
import { getDb } from "@/db/client";

export type MemoryCategory = "preferences" | "routines_patterns" | "relationships_context";
export type MemorySource = "explicit_statement" | "inferred_pattern" | "suggestion_feedback";

export interface MemoryFact {
  id: string;
  fact: string;
  category: MemoryCategory | null;
  source: MemorySource | null;
  confidence: number;
  lastReinforcedAt: string | null;
  isSensitive: boolean;
  flagged: boolean;
}

interface MemoryRow {
  id: string;
  fact: string;
  category: MemoryCategory | null;
  source: MemorySource | null;
  confidence: number;
  last_reinforced_at: string | null;
  is_sensitive: number;
  flagged: number;
}

// Facts fade in priority the longer they go unreinforced (AI_Memory.md:
// "Entries fade in priority automatically... deprioritized... rather than
// deleted outright"). A 30-day half-life isn't specified in the docs — a
// reasonable default for a household-pace app, easy to tune later.
const HALF_LIFE_DAYS = 30;

/** Pure — the decayed priority used to rank which facts the AI actively draws on. */
export function decayedPriority(confidence: number, lastReinforcedAt: string | null, now: Date = new Date()): number {
  if (!lastReinforcedAt) return confidence;
  const daysSince = Math.max(0, (now.getTime() - new Date(lastReinforcedAt).getTime()) / (1000 * 60 * 60 * 24));
  return confidence * Math.pow(0.5, daysSince / HALF_LIFE_DAYS);
}

function toMemoryFact(row: MemoryRow): MemoryFact {
  return {
    id: row.id,
    fact: row.fact,
    category: row.category,
    source: row.source,
    confidence: row.confidence,
    lastReinforcedAt: row.last_reinforced_at,
    isSensitive: !!row.is_sensitive,
    flagged: !!row.flagged,
  };
}

/** The facts the AI should actively draw on for this user, ranked by decayed priority. */
export async function getTopMemories(userId: string, limit = 10): Promise<MemoryFact[]> {
  const rows = getDb().prepare(`SELECT * FROM ai_memory WHERE user_id = ?`).all(userId) as MemoryRow[];
  return rows
    .map(toMemoryFact)
    .sort((a, b) => decayedPriority(b.confidence, b.lastReinforcedAt) - decayedPriority(a.confidence, a.lastReinforcedAt))
    .slice(0, limit);
}

/** Renders top memories as plain text for the Context Layer of the prompt. */
export function formatMemoriesForPrompt(memories: MemoryFact[]): string {
  if (memories.length === 0) return "No stored facts about this person yet.";
  return memories.map((m) => `- ${m.fact}`).join("\n");
}

export async function createMemoryFact(input: {
  userId: string;
  fact: string;
  category?: MemoryCategory;
  source: MemorySource;
  isSensitive?: boolean;
}): Promise<void> {
  getDb()
    .prepare(
      `INSERT INTO ai_memory (id, user_id, fact, category, source, confidence, last_reinforced_at, is_sensitive)
       VALUES (?, ?, ?, ?, ?, 1.0, ?, ?)`
    )
    .run(
      randomUUID(),
      input.userId,
      input.fact,
      input.category ?? null,
      input.source,
      new Date().toISOString(),
      input.isSensitive ? 1 : 0
    );
}

/** Confirms a fact is still relevant — resets its decay clock and nudges confidence up. */
export async function reinforceMemoryFact(id: string): Promise<void> {
  getDb()
    .prepare(`UPDATE ai_memory SET last_reinforced_at = ?, confidence = MIN(1.0, confidence + 0.1) WHERE id = ?`)
    .run(new Date().toISOString(), id);
}
