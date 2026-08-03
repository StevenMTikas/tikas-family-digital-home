process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { beforeAll, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import {
  advanceEventDateTime,
  advanceTaskDueDate,
  eventRecurrenceWindowEnd,
  taskRecurrenceWindowEnd,
  topUpEventSeries,
  topUpTaskSeries,
} from "./recurrence";

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('vee', 'vee.test', 'x', 'Vee', 'admin')`
  ).run();
});

describe("advanceEventDateTime / addMonthsClamped", () => {
  it("advances daily/weekly/biweekly by exact day counts", () => {
    expect(advanceEventDateTime("2026-01-01T09:00:00", "daily")).toBe("2026-01-02T09:00:00");
    expect(advanceEventDateTime("2026-01-01T09:00:00", "weekly")).toBe("2026-01-08T09:00:00");
    expect(advanceEventDateTime("2026-01-01T09:00:00", "biweekly")).toBe("2026-01-15T09:00:00");
  });

  it("clamps Jan 31 + 1 month to the last day of February in a non-leap year", () => {
    expect(advanceEventDateTime("2026-01-31T10:00:00", "monthly")).toBe("2026-02-28T10:00:00");
  });

  it("clamps Jan 31 + 1 month to Feb 29 in a leap year", () => {
    expect(advanceEventDateTime("2028-01-31T10:00:00", "monthly")).toBe("2028-02-29T10:00:00");
  });

  it("clamps Feb 29 + 1 year to Feb 28 in a non-leap year", () => {
    expect(advanceEventDateTime("2028-02-29T10:00:00", "yearly")).toBe("2029-02-28T10:00:00");
  });

  it("does not clamp a normal month-end rollover that doesn't need it", () => {
    expect(advanceEventDateTime("2026-01-15T10:00:00", "monthly")).toBe("2026-02-15T10:00:00");
  });
});

describe("advanceTaskDueDate", () => {
  it("advances a date-only string without UTC-midnight drift", () => {
    expect(advanceTaskDueDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advanceTaskDueDate("2026-03-01", "weekly")).toBe("2026-03-08");
  });
});

describe("eventRecurrenceWindowEnd / taskRecurrenceWindowEnd", () => {
  it("both advance exactly 3 months ahead of the given now", () => {
    const now = new Date(2026, 0, 15, 8, 30, 0);
    expect(eventRecurrenceWindowEnd(now)).toBe("2026-04-15T08:30:00");
    expect(taskRecurrenceWindowEnd(now)).toBe("2026-04-15");
  });
});

function insertRootEvent(db: ReturnType<typeof getDb>, overrides: Partial<Record<string, unknown>> = {}) {
  const id = overrides.id ?? randomUUID();
  const recurrenceId = (overrides.recurrence_id as string) ?? randomUUID();
  db.prepare(
    `INSERT INTO events (id, title, description, date_time, created_by, visibility, category, reminder_lead_time, recurrence_id, recurrence_frequency, recurrence_until)
     VALUES (@id, @title, @description, @date_time, @created_by, @visibility, @category, @reminder_lead_time, @recurrence_id, @recurrence_frequency, @recurrence_until)`
  ).run({
    id,
    title: "Weekly Standup",
    description: null,
    date_time: "2026-01-01T09:00:00",
    created_by: "dad",
    visibility: "public",
    category: null,
    reminder_lead_time: null,
    recurrence_id: recurrenceId,
    recurrence_frequency: "weekly",
    recurrence_until: null,
    ...overrides,
  });
  return { id, recurrenceId };
}

describe("topUpEventSeries", () => {
  it("creates occurrences up to (but not past) the window end", () => {
    const db = getDb();
    const { recurrenceId } = insertRootEvent(db);

    const created = topUpEventSeries(recurrenceId, "2026-01-29T09:00:00");

    const rows = db
      .prepare(`SELECT date_time FROM events WHERE recurrence_id = ? ORDER BY date_time`)
      .all(recurrenceId) as { date_time: string }[];
    expect(created).toBe(4);
    expect(rows.map((r) => r.date_time)).toEqual([
      "2026-01-01T09:00:00",
      "2026-01-08T09:00:00",
      "2026-01-15T09:00:00",
      "2026-01-22T09:00:00",
      "2026-01-29T09:00:00",
    ]);
  });

  it("copies title/description/visibility/category/reminder from the latest occurrence", () => {
    const db = getDb();
    const { recurrenceId } = insertRootEvent(db, {
      title: "Budget Review",
      description: "Monthly check-in",
      visibility: "private",
      category: "Budget",
      reminder_lead_time: "1 day",
    });

    topUpEventSeries(recurrenceId, "2026-01-08T09:00:00");

    const next = db
      .prepare(`SELECT * FROM events WHERE recurrence_id = ? ORDER BY date_time DESC LIMIT 1`)
      .get(recurrenceId) as Record<string, unknown>;
    expect(next.title).toBe("Budget Review");
    expect(next.description).toBe("Monthly check-in");
    expect(next.visibility).toBe("private");
    expect(next.category).toBe("Budget");
    expect(next.reminder_lead_time).toBe("1 day");
  });

  it("carries event_assignments forward onto each newly created occurrence", () => {
    const db = getDb();
    const { id: rootId, recurrenceId } = insertRootEvent(db);
    db.prepare(`INSERT INTO event_assignments (event_id, user_id) VALUES (?, ?)`).run(rootId, "vee");

    topUpEventSeries(recurrenceId, "2026-01-08T09:00:00");

    const next = db
      .prepare(`SELECT id FROM events WHERE recurrence_id = ? ORDER BY date_time DESC LIMIT 1`)
      .get(recurrenceId) as { id: string };
    const assignments = db.prepare(`SELECT user_id FROM event_assignments WHERE event_id = ?`).all(next.id);
    expect(assignments).toEqual([{ user_id: "vee" }]);
  });

  it("stops at recurrence_until even if the window would otherwise allow more", () => {
    const db = getDb();
    const { recurrenceId } = insertRootEvent(db, { recurrence_until: "2026-01-15T09:00:00" });

    const created = topUpEventSeries(recurrenceId, "2026-02-01T09:00:00");

    const rows = db.prepare(`SELECT date_time FROM events WHERE recurrence_id = ?`).all(recurrenceId) as {
      date_time: string;
    }[];
    // Root occurrence (Jan 1) + one generated (Jan 8) — Jan 15 is excluded because
    // `next >= untilRow.until` is the stop condition, and the next candidate after
    // Jan 8 is exactly Jan 15, i.e. the truncation boundary itself.
    expect(created).toBe(1);
    expect(rows.map((r) => r.date_time).sort()).toEqual(["2026-01-01T09:00:00", "2026-01-08T09:00:00"]);
  });

  it("returns 0 immediately for a non-existent or non-recurring series", () => {
    expect(topUpEventSeries(randomUUID(), "2099-01-01T00:00:00")).toBe(0);
  });

  it("is capped at 500 iterations so a runaway series can't hang or spam the DB indefinitely", () => {
    const db = getDb();
    const { recurrenceId } = insertRootEvent(db, {
      date_time: "2000-01-01T09:00:00",
      recurrence_frequency: "daily",
    });

    const created = topUpEventSeries(recurrenceId, "2099-01-01T09:00:00");

    expect(created).toBe(500);
    const count = db.prepare(`SELECT COUNT(*) as n FROM events WHERE recurrence_id = ?`).get(recurrenceId) as {
      n: number;
    };
    // +1 for the original root row.
    expect(count.n).toBe(501);
  }, 20000);
});

function insertRootTask(db: ReturnType<typeof getDb>, overrides: Partial<Record<string, unknown>> = {}) {
  const id = overrides.id ?? randomUUID();
  const recurrenceId = (overrides.recurrence_id as string) ?? randomUUID();
  db.prepare(
    `INSERT INTO tasks (id, title, description, owner_id, due_date, status, created_by, assigned_by, visibility, recurrence_id, recurrence_frequency, recurrence_until)
     VALUES (@id, @title, @description, @owner_id, @due_date, @status, @created_by, @assigned_by, @visibility, @recurrence_id, @recurrence_frequency, @recurrence_until)`
  ).run({
    id,
    title: "Take out trash",
    description: null,
    owner_id: "dad",
    due_date: "2026-01-01",
    status: "done",
    created_by: "dad",
    assigned_by: "dad",
    visibility: "public",
    recurrence_id: recurrenceId,
    recurrence_frequency: "weekly",
    recurrence_until: null,
    ...overrides,
  });
  return { id, recurrenceId };
}

describe("topUpTaskSeries", () => {
  it("creates occurrences up to the window end, each starting fresh at not_done", () => {
    const db = getDb();
    const { recurrenceId } = insertRootTask(db, { status: "done" });

    const created = topUpTaskSeries(recurrenceId, "2026-01-15");

    const rows = db
      .prepare(`SELECT due_date, status FROM tasks WHERE recurrence_id = ? ORDER BY due_date`)
      .all(recurrenceId) as { due_date: string; status: string }[];
    expect(created).toBe(2);
    expect(rows).toEqual([
      { due_date: "2026-01-01", status: "done" },
      { due_date: "2026-01-08", status: "not_done" },
      { due_date: "2026-01-15", status: "not_done" },
    ]);
  });

  it("returns 0 for a series whose latest row has no due_date", () => {
    const db = getDb();
    const { recurrenceId } = insertRootTask(db, { due_date: null });
    expect(topUpTaskSeries(recurrenceId, "2026-06-01")).toBe(0);
  });

  it("respects recurrence_until truncation the same way as events", () => {
    const db = getDb();
    const { recurrenceId } = insertRootTask(db, { recurrence_until: "2026-01-15" });

    const created = topUpTaskSeries(recurrenceId, "2026-02-01");

    const rows = db.prepare(`SELECT due_date FROM tasks WHERE recurrence_id = ?`).all(recurrenceId) as {
      due_date: string;
    }[];
    expect(created).toBe(1);
    expect(rows.map((r) => r.due_date).sort()).toEqual(["2026-01-01", "2026-01-08"]);
  });
});
