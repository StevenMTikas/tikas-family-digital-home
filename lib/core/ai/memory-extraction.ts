// Periodic, per-user distillation of durable AI_Memory facts from recent
// Assistant conversation content plus their own upcoming events/open tasks
// — "build a persistent profile... from the things they ask along with
// tasks, events, etc." (2026-08-01). Nothing ever wrote to AI_Memory before
// this (memory.ts's createMemoryFact existed but was never called anywhere)
// — the Assistant's own "I don't have a persistent profile" was accurate.
// Runs on the same daily, background-job cadence as Guardian/Advisor
// (AI_Architecture.md's hybrid memory model, "the dashboard should learn
// slowly") — a per-message extraction call would be both slower per reply
// and a much more eager/surveillance-feeling pace than this app's own
// stated philosophy.

import { getDb } from "@/db/client";
import { ollamaChat } from "./ollama";
import { getModelForRole, logAiInteraction } from "./index";
import { getBaseLayerPrompt } from "./base-layer";
import { createMemoryFact, type MemoryCategory } from "./memory";
import { getLastMemoryExtractionAt, hoursSince } from "./scheduler";

const MEMORY_EXTRACTION_INTERVAL_HOURS = 24;
const MAX_FACTS_PER_RUN = 5; // a noisy conversation shouldn't flood a profile in one pass
const MAX_MESSAGES_CONSIDERED = 40;
const LOOKAHEAD_DAYS = 14;

interface ExtractedFact {
  fact: string;
  category?: MemoryCategory;
}

const VALID_CATEGORIES: MemoryCategory[] = ["preferences", "routines_patterns", "relationships_context"];

function parseExtractedFacts(raw: string): ExtractedFact[] {
  try {
    const parsed = JSON.parse(raw.trim());
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is { fact?: unknown; category?: unknown } => typeof item === "object" && item !== null)
      .map((item) => ({
        fact: typeof item.fact === "string" ? item.fact.trim() : "",
        category: VALID_CATEGORIES.includes(item.category as MemoryCategory) ? (item.category as MemoryCategory) : undefined,
      }))
      .filter((item) => item.fact.length > 0)
      .slice(0, MAX_FACTS_PER_RUN);
  } catch {
    return []; // a malformed extraction shouldn't break the scheduler tick
  }
}

function getRecentAssistantText(userId: string, sinceIso: string): string {
  const rows = getDb()
    .prepare(
      `SELECT m.role, m.content FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = ? AND m.created_at > ?
       ORDER BY m.created_at
       LIMIT ?`
    )
    .all(userId, sinceIso, MAX_MESSAGES_CONSIDERED) as { role: "user" | "assistant"; content: string }[];

  return rows.map((r) => `${r.role === "user" ? "They said" : "Assistant replied"}: ${r.content}`).join("\n");
}

function getOwnUpcomingContext(userId: string): string {
  const db = getDb();
  const now = new Date().toISOString().slice(0, 19);
  const end = new Date(Date.now() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 19);

  const events = db
    .prepare(`SELECT title, date_time FROM events WHERE created_by = ? AND date_time >= ? AND date_time < ? ORDER BY date_time`)
    .all(userId, now, end) as { title: string; date_time: string }[];

  const tasks = db
    .prepare(`SELECT title, due_date FROM tasks WHERE owner_id = ? AND status = 'not_done' ORDER BY due_date IS NULL, due_date LIMIT 10`)
    .all(userId) as { title: string; due_date: string | null }[];

  const lines: string[] = [];
  if (events.length > 0) lines.push("Their upcoming events:", ...events.map((e) => `- ${e.title} (${e.date_time})`));
  if (tasks.length > 0) lines.push("Their open tasks:", ...tasks.map((t) => `- ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}`));
  return lines.join("\n");
}

/** Distills durable facts for one user from their recent Assistant activity — the write side of AI_Memory. Returns how many facts were created. */
export async function extractMemoryForUser(userId: string, sinceIso: string): Promise<number> {
  const conversationText = getRecentAssistantText(userId, sinceIso);
  const upcomingContext = getOwnUpcomingContext(userId);
  if (!conversationText && !upcomingContext) return 0; // nothing new to look at

  const model = getModelForRole("guardian"); // small/fast model — a background pass, not a live reply
  const systemPrompt = [
    getBaseLayerPrompt(),
    "",
    'You distill a small number of durable, worth-remembering facts about one family member from their recent Assistant conversation and their own upcoming events/tasks. A durable fact is a preference, a recurring routine or pattern, or relationship/context info — NOT a one-off answer, small talk, or anything already obvious from a single event/task title repeated back verbatim.',
    'Respond with ONLY a JSON array, each item {"fact": string, "category": "preferences" | "routines_patterns" | "relationships_context"}. If nothing new and durable stands out, respond with an empty array []. Never invent a fact that is not actually supported by what you were given.',
  ].join("\n");

  const reply = await ollamaChat(model, [
    { role: "system", content: systemPrompt },
    { role: "user", content: [conversationText, upcomingContext].filter(Boolean).join("\n\n") },
  ]);

  const facts = parseExtractedFacts(reply.content);
  for (const item of facts) {
    await createMemoryFact({ userId, fact: item.fact, category: item.category, source: "inferred_pattern" });
  }
  return facts.length;
}

/** Runs extraction for every AI-enabled user who's due for it (per-user daily cadence, checked individually). */
export async function runMemoryExtraction(): Promise<{ usersProcessed: number; factsCreated: number }> {
  const db = getDb();
  const users = db.prepare(`SELECT id FROM users WHERE ai_enabled = 1`).all() as { id: string }[];

  let usersProcessed = 0;
  let factsCreated = 0;

  for (const user of users) {
    const last = getLastMemoryExtractionAt(user.id);
    if (last && hoursSince(last) < MEMORY_EXTRACTION_INTERVAL_HOURS) continue;

    const since = last ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    try {
      const created = await extractMemoryForUser(user.id, since);
      factsCreated += created;
      usersProcessed += 1;
      // agent: 'assistant' since this distills the Assistant's own
      // conversations, not a separate role — the memoryExtraction flag is
      // what getLastMemoryExtractionAt actually keys off of, per-user.
      await logAiInteraction("assistant", user.id, { memoryExtraction: true, factsCreated: created });
    } catch (err) {
      console.error(`[memory-extraction] Failed for user ${user.id}:`, err);
    }
  }

  return { usersProcessed, factsCreated };
}
