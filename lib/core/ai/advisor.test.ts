process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect, vi } from "vitest";
import { getDb } from "@/db/client";
import {
  detectFindings,
  expireStaleSuggestions,
  dampRelevancyScore,
  buildAdvisorSystemPrompt,
  runAdvisorDetectors,
  type Finding,
} from "./advisor";
import { createMemoryFact, getTopMemories } from "./memory";

const NOW = new Date("2026-07-25T12:00:00");
function inDays(days: number, timeOnly = false): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  return timeOnly ? d.toISOString().slice(0, 19) : d.toISOString().slice(0, 10);
}

beforeAll(() => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8");
  const db = getDb();
  db.exec(schema);

  db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`).run(
    "dad",
    "dad.test",
    "Dad",
    "super_admin"
  );

  // Event in 2 days, no reminder -> should be detected.
  db.prepare(
    `INSERT INTO events (id, title, date_time, created_by, reminder_lead_time) VALUES (?, ?, ?, ?, NULL)`
  ).run("evt-no-reminder", "Dentist", inDays(2, true), "dad");
  // Event in 2 days, WITH a reminder -> should not be detected.
  db.prepare(
    `INSERT INTO events (id, title, date_time, created_by, reminder_lead_time) VALUES (?, ?, ?, ?, ?)`
  ).run("evt-has-reminder", "Recital", inDays(2, true), "dad", "1 hour before");
  // Event 10 days out, no reminder -> outside the 3-day detection window.
  db.prepare(
    `INSERT INTO events (id, title, date_time, created_by, reminder_lead_time) VALUES (?, ?, ?, ?, NULL)`
  ).run("evt-far-out", "Someday", inDays(10, true), "dad");

  // Task due tomorrow, not done -> should be detected.
  db.prepare(
    `INSERT INTO tasks (id, title, owner_id, due_date, status, created_by, assigned_by) VALUES (?, ?, ?, ?, 'not_done', ?, ?)`
  ).run("task-due-soon", "Pay HOA", "dad", inDays(1), "dad", "dad");
  // Task due tomorrow but already done -> should not be detected.
  db.prepare(
    `INSERT INTO tasks (id, title, owner_id, due_date, status, created_by, assigned_by) VALUES (?, ?, ?, ?, 'done', ?, ?)`
  ).run("task-done", "Already done", "dad", inDays(1), "dad", "dad");

  // Uncategorized document -> should be detected.
  db.prepare(`INSERT INTO documents (id, file, title, uploaded_by, category) VALUES (?, ?, ?, ?, NULL)`).run(
    "doc-uncategorized",
    "f.pdf",
    "Mystery doc",
    "dad"
  );
  // Categorized document -> should not be detected.
  db.prepare(`INSERT INTO documents (id, file, title, uploaded_by, category) VALUES (?, ?, ?, ?, ?)`).run(
    "doc-categorized",
    "f2.pdf",
    "Tax return",
    "dad",
    "Tax"
  );
});

describe("detectFindings", () => {
  it("detects an event without a reminder within the next 3 days", () => {
    const findings = detectFindings(NOW);
    expect(findings.some((f) => f.relatedEntityId === "evt-no-reminder")).toBe(true);
  });

  it("does not flag an event that already has a reminder", () => {
    const findings = detectFindings(NOW);
    expect(findings.some((f) => f.relatedEntityId === "evt-has-reminder")).toBe(false);
  });

  it("does not flag an event far outside the detection window", () => {
    const findings = detectFindings(NOW);
    expect(findings.some((f) => f.relatedEntityId === "evt-far-out")).toBe(false);
  });

  it("detects a not-done task due within 2 days", () => {
    const findings = detectFindings(NOW);
    expect(findings.some((f) => f.relatedEntityId === "task-due-soon")).toBe(true);
  });

  it("does not flag a task that's already done", () => {
    const findings = detectFindings(NOW);
    expect(findings.some((f) => f.relatedEntityId === "task-done")).toBe(false);
  });

  it("detects an uncategorized document", () => {
    const findings = detectFindings(NOW);
    expect(findings.some((f) => f.relatedEntityId === "doc-uncategorized")).toBe(true);
  });

  it("does not flag a categorized document", () => {
    const findings = detectFindings(NOW);
    expect(findings.some((f) => f.relatedEntityId === "doc-categorized")).toBe(false);
  });

  it("targets the right user per finding", () => {
    const findings = detectFindings(NOW);
    const taskFinding = findings.find((f) => f.relatedEntityId === "task-due-soon");
    expect(taskFinding?.userId).toBe("dad");
  });
});

describe("expireStaleSuggestions", () => {
  it("expires a suggestion once its event gets a reminder added after the fact", async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO ai_suggestions (id, user_id, module, trigger_type, content, related_entity_id, expired)
       VALUES (?, 'dad', 'calendar', 'event', 'Add a reminder?', 'evt-no-reminder', 0)`
    ).run("sugg-1");

    // Simulate the user adding a reminder through the normal Calendar edit flow.
    db.prepare(`UPDATE events SET reminder_lead_time = '30 minutes before' WHERE id = 'evt-no-reminder'`).run();

    const count = await expireStaleSuggestions();
    expect(count).toBeGreaterThanOrEqual(1);

    const row = db.prepare(`SELECT expired, expired_reason FROM ai_suggestions WHERE id = 'sugg-1'`).get() as {
      expired: number;
      expired_reason: string;
    };
    expect(row.expired).toBe(1);
    expect(row.expired_reason).toBe("a reminder was set");
  });

  it("expires a suggestion when its related task was deleted", async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO ai_suggestions (id, user_id, module, trigger_type, content, related_entity_id, expired)
       VALUES (?, 'dad', 'tasks', 'event', 'Finish this task?', 'no-such-task', 0)`
    ).run("sugg-2");

    await expireStaleSuggestions();

    const row = db.prepare(`SELECT expired, expired_reason FROM ai_suggestions WHERE id = 'sugg-2'`).get() as {
      expired: number;
      expired_reason: string;
    };
    expect(row.expired).toBe(1);
    expect(row.expired_reason).toBe("task was deleted");
  });
});

// AI_Suggestions.md: feedback (thumbs-up/down/dismiss) "informs tone and
// preference over time via AI_Memory," with "no fixed '3 thumbs-down = never
// show this category again' logic" — dampRelevancyScore is the deterministic,
// testable piece that implements the gradual, non-hard-cutoff half of that.
describe("dampRelevancyScore", () => {
  it("returns the base score unchanged with no prior negative feedback", () => {
    expect(dampRelevancyScore(0.6, 0)).toBeCloseTo(0.6, 5);
  });

  it("shrinks gradually as negative feedback accumulates", () => {
    const one = dampRelevancyScore(0.6, 1);
    const three = dampRelevancyScore(0.6, 3);
    expect(one).toBeLessThan(0.6);
    expect(three).toBeLessThan(one);
    expect(three).toBeGreaterThan(0);
  });

  it("never fully suppresses a module — floors above zero even with heavy negative feedback", () => {
    expect(dampRelevancyScore(0.6, 100)).toBeCloseTo(0.1, 5);
  });
});

describe("buildAdvisorSystemPrompt", () => {
  const calendarFinding: Finding = {
    userId: "dad",
    module: "calendar",
    relatedEntityId: "evt-no-reminder",
    rawFinding: 'The event "Dentist" on 2026-07-27T12:00:00 has no reminder set.',
    relevancyScore: 0.6,
  };

  it("includes the person's stored preference facts so tone/frequency can adapt", () => {
    const memories = [
      {
        id: "m1",
        fact: 'Found this calendar suggestion unhelpful: "Add a reminder?"',
        category: "preferences" as const,
        source: "suggestion_feedback" as const,
        confidence: 0.7,
        lastReinforcedAt: null,
        isSensitive: false,
        flagged: false,
      },
    ];
    const prompt = buildAdvisorSystemPrompt(calendarFinding, memories);
    expect(prompt).toContain('Found this calendar suggestion unhelpful: "Add a reminder?"');
  });

  it("still includes the category instruction for a documents finding", () => {
    const finding: Finding = {
      userId: "dad",
      module: "documents",
      relatedEntityId: "doc-uncategorized",
      rawFinding: "x",
      relevancyScore: 0.4,
    };
    expect(buildAdvisorSystemPrompt(finding, [])).toContain("CATEGORY:");
  });
});

describe("runAdvisorDetectors — feedback loop", () => {
  it("dampens relevancy_score from prior negative feedback on the same module, and surfaces preference facts to the LLM", async () => {
    const db = getDb();

    // runAdvisorDetectors calls detectFindings() with no explicit `now`, so
    // it uses the real current time — unlike the rest of this file's
    // fixtures, this one can't be dated relative to the NOW constant above.
    const realSoon = new Date();
    realSoon.setDate(realSoon.getDate() + 2);
    db.prepare(
      `INSERT INTO events (id, title, date_time, created_by, reminder_lead_time) VALUES (?, ?, ?, ?, NULL)`
    ).run("evt-feedback-loop", "Checkup", realSoon.toISOString().slice(0, 19), "dad");

    // Two prior negative feedback events on calendar suggestions for dad.
    db.prepare(
      `INSERT INTO ai_suggestions (id, user_id, module, trigger_type, content, feedback, expired) VALUES (?, 'dad', 'calendar', 'event', 'x', 'thumbs_down', 1)`
    ).run("prior-neg-1");
    db.prepare(
      `INSERT INTO ai_suggestions (id, user_id, module, trigger_type, content, feedback, expired) VALUES (?, 'dad', 'calendar', 'event', 'y', 'dismissed', 1)`
    ).run("prior-neg-2");

    await createMemoryFact({
      userId: "dad",
      fact: 'Found this calendar suggestion unhelpful: "Add a reminder?"',
      category: "preferences",
      source: "suggestion_feedback",
      confidence: 0.7,
    });

    const calls: { messages: { role: string; content: string }[] }[] = [];
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
      calls.push(JSON.parse((init as RequestInit).body as string));
      return {
        ok: true,
        json: async () => ({ message: { content: "Add a reminder for the checkup?" } }),
      } as Response;
    });

    try {
      await runAdvisorDetectors("event");
    } finally {
      fetchSpy.mockRestore();
    }

    const calendarCall = calls.find((c) => c.messages.some((m) => m.role === "user" && m.content.includes("Checkup")));
    const systemMessage = calendarCall?.messages.find((m) => m.role === "system")?.content;
    expect(systemMessage).toContain('Found this calendar suggestion unhelpful: "Add a reminder?"');

    const row = db
      .prepare(`SELECT relevancy_score FROM ai_suggestions WHERE related_entity_id = 'evt-feedback-loop'`)
      .get() as { relevancy_score: number };
    expect(row.relevancy_score).toBeCloseTo(dampRelevancyScore(0.6, 2), 5);
  });

  it("verifies getTopMemories actually returns the fact used above (sanity check on the fixture)", async () => {
    const memories = await getTopMemories("dad", 50);
    expect(memories.some((m) => m.fact === 'Found this calendar suggestion unhelpful: "Add a reminder?"')).toBe(true);
  });
});
