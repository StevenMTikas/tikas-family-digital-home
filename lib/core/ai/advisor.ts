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

async function phraseFinding(finding: Finding): Promise<string> {
  const model = getModelForRole("advisor");
  const messages = [
    { role: "system" as const, content: [getBaseLayerPrompt(), "", ADVISOR_ROLE_PROMPT].join("\n") },
    { role: "user" as const, content: finding.rawFinding },
  ];
  const reply = await ollamaChat(model, messages);
  return reply.content.trim();
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
    const content = await phraseFinding(finding);
    const suggestionId = randomUUID();
    db.prepare(
      `INSERT INTO ai_suggestions (id, user_id, module, trigger_type, display_context, relevancy_score, content, related_entity_id)
       VALUES (?, ?, ?, ?, 'dashboard', ?, ?, ?)`
    ).run(suggestionId, finding.userId, finding.module, triggerType, finding.relevancyScore, content, finding.relatedEntityId);

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
