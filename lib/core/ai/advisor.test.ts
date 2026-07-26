process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { detectFindings, expireStaleSuggestions } from "./advisor";

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
