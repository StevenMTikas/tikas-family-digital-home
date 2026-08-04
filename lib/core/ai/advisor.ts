// Advisor: detects concrete, factual conditions worth suggesting, then asks
// the LLM only to phrase the finding naturally — detection stays
// deterministic and testable, phrasing is where the model earns its keep.
// See docs/05_AI/Advisor.md (trigger model, starter suggestion types) and
// docs/05_AI/AI_Suggestions.md (lifecycle, expiration).

import { randomUUID } from "crypto";
import { getDb } from "@/db/client";
import { ollamaChat } from "./ollama";
import { getModelForRole, logAiInteraction } from "./index";
import { getBaseLayerPrompt } from "./base-layer";
import { ADVISOR_ROLE_PROMPT } from "./roles";
import { createNotification } from "@/lib/core/notifications";
import { getTopMemories, formatMemoriesForPrompt, type MemoryFact } from "./memory";

export type AdvisorModule = "calendar" | "tasks" | "documents";

export interface Finding {
  userId: string;
  module: AdvisorModule;
  relatedEntityId: string;
  rawFinding: string;
  relevancyScore: number;
}

// Starter list, per Advisor.md — a small, concrete slice of the fuller
// list there. Each is a plain SQL condition; no LLM involved in detection.

function detectEventsWithoutReminder(now: Date): Finding[] {
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 3);
  const toIso = (d: Date) => d.toISOString().slice(0, 19);

  const rows = getDb()
    .prepare(
      `SELECT id, title, date_time, created_by FROM events
       WHERE reminder_lead_time IS NULL AND date_time >= ? AND date_time <= ?`
    )
    .all(toIso(now), toIso(soon)) as { id: string; title: string; date_time: string; created_by: string }[];

  return rows.map((row) => ({
    userId: row.created_by,
    module: "calendar",
    relatedEntityId: row.id,
    rawFinding: `The event "${row.title}" on ${row.date_time} has no reminder set.`,
    relevancyScore: 0.6,
  }));
}

function detectTasksNearingDue(now: Date): Finding[] {
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 2);
  const toIso = (d: Date) => d.toISOString().slice(0, 10);

  const rows = getDb()
    .prepare(
      `SELECT id, title, due_date, owner_id FROM tasks
       WHERE status = 'not_done' AND due_date IS NOT NULL AND due_date >= ? AND due_date <= ?`
    )
    .all(toIso(now), toIso(soon)) as { id: string; title: string; due_date: string; owner_id: string }[];

  return rows.map((row) => ({
    userId: row.owner_id,
    module: "tasks",
    relatedEntityId: row.id,
    rawFinding: `The task "${row.title}" is due ${row.due_date} and is still not done.`,
    relevancyScore: 0.8,
  }));
}

function detectUncategorizedDocuments(): Finding[] {
  const rows = getDb()
    .prepare(`SELECT id, title, uploaded_by FROM documents WHERE category IS NULL`)
    .all() as { id: string; title: string; uploaded_by: string }[];

  return rows.map((row) => ({
    userId: row.uploaded_by,
    module: "documents",
    relatedEntityId: row.id,
    rawFinding: `The document "${row.title}" was uploaded without a category.`,
    relevancyScore: 0.4,
  }));
}

export function detectFindings(now: Date = new Date()): Finding[] {
  return [...detectEventsWithoutReminder(now), ...detectTasksNearingDue(now), ...detectUncategorizedDocuments()];
}

function hasActiveSuggestion(module: string, relatedEntityId: string): boolean {
  const row = getDb()
    .prepare(`SELECT id FROM ai_suggestions WHERE module = ? AND related_entity_id = ? AND expired = 0`)
    .get(module, relatedEntityId);
  return !!row;
}

interface PhrasedFinding {
  content: string;
  suggestedValue: string | null;
}

const SUGGESTED_CATEGORY_LINE = /\n?CATEGORY:\s*(.+)\s*$/i;

/**
 * For a documents-module finding, asks the LLM to commit to ONE specific
 * category (not just describe the situation in prose) so "Accept" has a
 * single unambiguous value to pre-fill — content alone can't be parsed
 * reliably for this (the model sometimes phrases a sentence offering
 * several options, e.g. "'Work' or 'Financial Documents'"). Reusing an
 * existing category when one fits keeps the household's category list from
 * sprawling into near-duplicates ("Finances" vs "Financial" vs "Finance").
 */
function categoryInstruction(): string {
  const existing = (
    getDb().prepare(`SELECT DISTINCT category FROM documents WHERE category IS NOT NULL ORDER BY category`).all() as {
      category: string;
    }[]
  ).map((r) => r.category);

  const reuseHint =
    existing.length > 0
      ? `Categories already in use in this household: ${existing.join(", ")}. Reuse one of these if it genuinely fits, rather than inventing a near-duplicate.`
      : "";

  return [
    "When suggesting a document category, commit to exactly ONE specific category — never offer a choice between multiple options.",
    reuseHint,
    "End your reply on its own new line with exactly: CATEGORY: <the one category name>",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Backfills a single missing suggested_value for a documents-module
 * suggestion, on demand — for a suggestion generated before phraseFinding
 * started capturing this (e.g. any of the ~2,500 already active when this
 * was added, 2026-07-30). Called lazily from the Accept endpoint rather
 * than as a one-time bulk migration: touching only the specific suggestion
 * someone actually clicks Accept on is a single LLM call instead of hours
 * spent re-processing suggestions nobody may ever act on.
 *
 * Extracts from the suggestion's *existing* content rather than generating
 * a fresh independent guess — a second, unrelated LLM call can land on a
 * different category than the one the user already read in the suggestion
 * text (confirmed live: re-guessing produced "Financials" for a document
 * whose displayed suggestion said "School"). Reconciling with what was
 * already shown keeps Accept's pre-fill matching what the user actually read.
 */
export async function suggestCategoryForDocument(existingContent: string): Promise<string | null> {
  const model = getModelForRole("advisor");
  const messages = [
    {
      role: "system" as const,
      content: [
        getBaseLayerPrompt(),
        "",
        "You previously wrote a suggestion recommending a family member categorize a document a certain way. Identify the ONE specific category that suggestion recommends — do not invent a new guess, extract exactly what was already recommended.",
        "End your reply on its own new line with exactly: CATEGORY: <the one category name>",
      ].join("\n"),
    },
    { role: "user" as const, content: existingContent },
  ];
  const reply = await ollamaChat(model, messages);
  const match = reply.content.trim().match(SUGGESTED_CATEGORY_LINE);
  return match ? match[1]!.trim().replace(/^["']|["']$/g, "") : null;
}

/**
 * Split out from phraseFinding so it can be unit-tested without hitting
 * Ollama (same pattern as buildAssistantMessages in index.ts). AI_Suggestions.md:
 * feedback "informs tone and preference over time via AI_Memory" — this is
 * the read side of that loop; the write side is app/api/ai-suggestions/[id]/route.ts.
 */
export function buildAdvisorSystemPrompt(finding: Finding, memories: MemoryFact[]): string {
  const systemParts = [
    getBaseLayerPrompt(),
    "",
    ADVISOR_ROLE_PROMPT,
    "",
    "What you know about this person's preferences (weigh negative feedback on similar past suggestions — soften tone or reconsider whether this is worth surfacing at all, without treating it as a hard rule):",
    formatMemoriesForPrompt(memories),
  ];
  if (finding.module === "documents") systemParts.push("", categoryInstruction());
  return systemParts.join("\n");
}

async function phraseFinding(finding: Finding): Promise<PhrasedFinding> {
  const model = getModelForRole("advisor");
  const memories = await getTopMemories(finding.userId);

  const messages = [
    { role: "system" as const, content: buildAdvisorSystemPrompt(finding, memories) },
    { role: "user" as const, content: finding.rawFinding },
  ];
  const reply = await ollamaChat(model, messages);
  const raw = reply.content.trim();

  const match = raw.match(SUGGESTED_CATEGORY_LINE);
  if (!match) return { content: raw, suggestedValue: null };

  return {
    content: raw.slice(0, match.index).trim(),
    suggestedValue: match[1]!.trim().replace(/^["']|["']$/g, ""),
  };
}

// How much each past negative signal (thumbs-down or dismiss, undifferentiated
// — the DB only records which one, not how many facts it produced) shrinks a
// future suggestion's relevancy_score for that same module. AI_Suggestions.md
// explicitly rules out a hard cutoff ("no fixed '3 thumbs-down = never show
// this category again' logic"), so this decays the score geometrically with
// a floor rather than zeroing it out — a module can always still surface,
// just gets crowded out of the top-10 ordering (ai-suggestions/route.ts,
// dashboard/page.tsx) more easily the more it's been rejected.
const RELEVANCY_DAMPING_FACTOR = 0.85;
const RELEVANCY_FLOOR = 0.1;

/** Pure — how much a finding's base relevancy should shrink given prior negative feedback on that module. */
export function dampRelevancyScore(baseScore: number, negativeFeedbackCount: number): number {
  return Math.max(RELEVANCY_FLOOR, baseScore * Math.pow(RELEVANCY_DAMPING_FACTOR, negativeFeedbackCount));
}

function countNegativeFeedback(userId: string, module: AdvisorModule): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as count FROM ai_suggestions WHERE user_id = ? AND module = ? AND feedback IN ('thumbs_down', 'dismissed')`
    )
    .get(userId, module) as { count: number };
  return row.count;
}

/**
 * Runs all detectors and creates an AI_Suggestion for each new finding
 * (skipping anything already actively suggested for the same entity).
 * `triggerType` records whether this run came from an event or the weekly
 * check (Advisor.md's two trigger types) — same detectors either way.
 */
export async function runAdvisorDetectors(triggerType: "event" | "weekly_check"): Promise<number> {
  const db = getDb();
  const findings = detectFindings().filter((f) => !hasActiveSuggestion(f.module, f.relatedEntityId));

  let created = 0;
  for (const finding of findings) {
    const { content, suggestedValue } = await phraseFinding(finding);
    const relevancyScore = dampRelevancyScore(finding.relevancyScore, countNegativeFeedback(finding.userId, finding.module));
    const suggestionId = randomUUID();
    db.prepare(
      `INSERT INTO ai_suggestions (id, user_id, module, trigger_type, display_context, relevancy_score, content, related_entity_id, suggested_value)
       VALUES (?, ?, ?, ?, 'dashboard', ?, ?, ?, ?)`
    ).run(
      suggestionId,
      finding.userId,
      finding.module,
      triggerType,
      relevancyScore,
      content,
      finding.relatedEntityId,
      suggestedValue
    );

    // Notifications.md: "Advisor suggestions... all flow through this same
    // general Notification system" — not just the Suggestion History/Dashboard list.
    await createNotification({ userId: finding.userId, text: content, relatedSuggestionId: suggestionId });
    created += 1;
  }

  // No single "requesting user" for a detector sweep — logSecurityEvent
  // stores NULL for an empty userId (security_events.user_id has no row to
  // reference otherwise, and the FK would reject a made-up id like "system").
  await logAiInteraction("advisor", "", { triggerType, findingsCount: findings.length, created });
  return created;
}

interface SuggestionRow {
  id: string;
  module: AdvisorModule | null;
  related_entity_id: string | null;
}

/** Re-checks each active suggestion's underlying condition, expiring anything resolved. */
export async function expireStaleSuggestions(): Promise<number> {
  const db = getDb();
  const active = db
    .prepare(`SELECT id, module, related_entity_id FROM ai_suggestions WHERE expired = 0`)
    .all() as SuggestionRow[];

  let expiredCount = 0;
  for (const suggestion of active) {
    const reason = checkExpired(suggestion);
    if (reason) {
      db.prepare(`UPDATE ai_suggestions SET expired = 1, expired_at = ?, expired_reason = ? WHERE id = ?`).run(
        new Date().toISOString(),
        reason,
        suggestion.id
      );
      expiredCount += 1;
    }
  }
  return expiredCount;
}

function checkExpired(suggestion: SuggestionRow): string | null {
  if (!suggestion.related_entity_id) return null;
  const db = getDb();

  if (suggestion.module === "calendar") {
    const event = db
      .prepare(`SELECT reminder_lead_time, date_time FROM events WHERE id = ?`)
      .get(suggestion.related_entity_id) as { reminder_lead_time: string | null; date_time: string } | undefined;
    if (!event) return "related event was deleted";
    if (event.reminder_lead_time) return "a reminder was set";
    if (event.date_time < new Date().toISOString()) return "related event passed";
    return null;
  }

  if (suggestion.module === "tasks") {
    const task = db.prepare(`SELECT status, due_date FROM tasks WHERE id = ?`).get(suggestion.related_entity_id) as
      | { status: string; due_date: string | null }
      | undefined;
    if (!task) return "task was deleted";
    if (task.status === "done") return "task completed";
    if (task.due_date && task.due_date < new Date().toISOString().slice(0, 10)) return "due date passed";
    return null;
  }

  if (suggestion.module === "documents") {
    const doc = db.prepare(`SELECT category FROM documents WHERE id = ?`).get(suggestion.related_entity_id) as
      | { category: string | null }
      | undefined;
    if (!doc) return "document was deleted";
    if (doc.category) return "document was categorized";
    return null;
  }

  return null;
}
