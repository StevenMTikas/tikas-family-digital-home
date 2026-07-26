process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { checkAndFireReminders } from "./reminders";
import { getRecentNotifications } from "./index";

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
  db.prepare(`INSERT INTO users (id, username, password_hash, full_name, role) VALUES (?, ?, 'x', ?, ?)`).run(
    "vee",
    "vee.test",
    "Vee",
    "admin"
  );
});

function inMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

describe("checkAndFireReminders — events", () => {
  it("fires a reminder once its lead time has arrived and marks reminder_sent_at", async () => {
    const db = getDb();
    const eventId = randomUUID();
    db.prepare(
      `INSERT INTO events (id, title, date_time, created_by, reminder_lead_time) VALUES (?, ?, ?, ?, ?)`
    ).run(eventId, "Dentist", inMinutes(10), "dad", "15 minutes before");
    db.prepare(`INSERT INTO event_assignments (event_id, user_id) VALUES (?, ?)`).run(eventId, "dad");

    const result = await checkAndFireReminders();
    expect(result.events).toBe(1);

    const notifications = getRecentNotifications("dad");
    expect(notifications[0]!.text).toContain("Dentist");
    expect(notifications[0]!.relatedEventId).toBe(eventId);

    const row = db.prepare(`SELECT reminder_sent_at FROM events WHERE id = ?`).get(eventId) as { reminder_sent_at: string | null };
    expect(row.reminder_sent_at).not.toBeNull();

    // Running again must not double-fire.
    const second = await checkAndFireReminders();
    expect(second.events).toBe(0);
  });

  it("does not fire before the lead time has actually arrived", async () => {
    const db = getDb();
    const eventId = randomUUID();
    db.prepare(
      `INSERT INTO events (id, title, date_time, created_by, reminder_lead_time) VALUES (?, ?, ?, ?, ?)`
    ).run(eventId, "Recital", inMinutes(120), "dad", "15 minutes before");
    db.prepare(`INSERT INTO event_assignments (event_id, user_id) VALUES (?, ?)`).run(eventId, "dad");

    await checkAndFireReminders();

    const row = db.prepare(`SELECT reminder_sent_at FROM events WHERE id = ?`).get(eventId) as { reminder_sent_at: string | null };
    expect(row.reminder_sent_at).toBeNull();
  });

  it("notifies every assignee, not just the creator", async () => {
    const db = getDb();
    const eventId = randomUUID();
    db.prepare(
      `INSERT INTO events (id, title, date_time, created_by, reminder_lead_time) VALUES (?, ?, ?, ?, ?)`
    ).run(eventId, "Family dinner", inMinutes(5), "dad", "15 minutes before");
    db.prepare(`INSERT INTO event_assignments (event_id, user_id) VALUES (?, ?)`).run(eventId, "dad");
    db.prepare(`INSERT INTO event_assignments (event_id, user_id) VALUES (?, ?)`).run(eventId, "vee");

    await checkAndFireReminders();

    expect(getRecentNotifications("dad").some((n) => n.relatedEventId === eventId)).toBe(true);
    expect(getRecentNotifications("vee").some((n) => n.relatedEventId === eventId)).toBe(true);
  });
});

describe("checkAndFireReminders — tasks", () => {
  it("fires once a task's due date has arrived, to both owner and assigner", async () => {
    const db = getDb();
    const taskId = randomUUID();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO tasks (id, title, owner_id, due_date, status, created_by, assigned_by) VALUES (?, ?, ?, ?, 'not_done', ?, ?)`
    ).run(taskId, "Take out trash", "vee", yesterday, "dad", "dad");

    const result = await checkAndFireReminders();
    expect(result.tasks).toBe(1);

    expect(getRecentNotifications("vee").some((n) => n.relatedTaskId === taskId)).toBe(true);
    expect(getRecentNotifications("dad").some((n) => n.relatedTaskId === taskId)).toBe(true);
  });

  it("does not fire for an already-completed task", async () => {
    const db = getDb();
    const taskId = randomUUID();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    db.prepare(
      `INSERT INTO tasks (id, title, owner_id, due_date, status, created_by, assigned_by) VALUES (?, ?, ?, ?, 'done', ?, ?)`
    ).run(taskId, "Already done", "vee", yesterday, "vee", "vee");

    await checkAndFireReminders();

    const row = db.prepare(`SELECT reminder_sent_at FROM tasks WHERE id = ?`).get(taskId) as { reminder_sent_at: string | null };
    expect(row.reminder_sent_at).toBeNull();
  });
});
