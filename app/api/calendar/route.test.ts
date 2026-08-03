process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { GET, POST } from "./route";

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, admin_scope) VALUES ('vee', 'vee.test', 'x', 'Vee', 'admin', '["malachi"]')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('malachi', 'malachi.test', 'x', 'Malachi', 'basic_user')`
  ).run();
});

beforeEach(() => {
  getDb().exec(`DELETE FROM event_assignments; DELETE FROM events;`);
});

function getReq(userId: string | null, week?: string) {
  const url = week ? `http://localhost/api/calendar?week=${week}` : "http://localhost/api/calendar";
  return new NextRequest(url, {
    headers: userId ? { "x-user-id": userId } : {},
  });
}

function postReq(userId: string | null, body: unknown) {
  return new NextRequest("http://localhost/api/calendar", {
    method: "POST",
    headers: { "x-user-id": userId ?? "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/calendar", () => {
  it("requires authentication", async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown user id", async () => {
    const res = await GET(getReq("ghost"));
    expect(res.status).toBe(401);
  });

  it("includes public events for any viewer", async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO events (id, title, date_time, created_by, visibility) VALUES (?, 'Family BBQ', '2026-01-05T12:00:00', 'dad', 'public')`
    ).run(randomUUID());

    const res = await GET(getReq("malachi", "2026-01-05"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("Family BBQ");
  });

  it("excludes another family member's private event, per Calendar.md's visibility rule", async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO events (id, title, date_time, created_by, visibility) VALUES (?, 'Dad Private', '2026-01-05T12:00:00', 'dad', 'private')`
    ).run(randomUUID());

    const res = await GET(getReq("malachi", "2026-01-05"));
    expect(await res.json()).toEqual([]);
  });

  it("includes the viewer's own private event", async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO events (id, title, date_time, created_by, visibility) VALUES (?, 'My Therapy', '2026-01-05T12:00:00', 'malachi', 'private')`
    ).run(randomUUID());

    const res = await GET(getReq("malachi", "2026-01-05"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].canEdit).toBe(true);
  });

  it("includes a private event created by a user the viewer has admin authority over", async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO events (id, title, date_time, created_by, visibility) VALUES (?, 'Malachi Private', '2026-01-05T12:00:00', 'malachi', 'private')`
    ).run(randomUUID());

    const res = await GET(getReq("vee", "2026-01-05"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].canEdit).toBe(true);
  });

  it("marks canEdit false for a public event the viewer doesn't manage", async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO events (id, title, date_time, created_by, visibility) VALUES (?, 'Family BBQ', '2026-01-05T12:00:00', 'dad', 'public')`
    ).run(randomUUID());

    const res = await GET(getReq("malachi", "2026-01-05"));
    const body = await res.json();
    expect(body[0].canEdit).toBe(false);
  });
});

describe("POST /api/calendar", () => {
  it("requires authentication", async () => {
    const res = await POST(postReq(null, { title: "x", dateTime: "2026-01-05T12:00:00", assigneeIds: ["dad"] }));
    expect(res.status).toBe(401);
  });

  it("requires title and dateTime", async () => {
    const res = await POST(postReq("dad", { assigneeIds: ["dad"] }));
    expect(res.status).toBe(400);
  });

  it("requires at least one assignee", async () => {
    const res = await POST(postReq("dad", { title: "x", dateTime: "2026-01-05T12:00:00", assigneeIds: [] }));
    expect(res.status).toBe(400);
  });

  it("persists a valid category", async () => {
    const res = await POST(
      postReq("dad", { title: "Pay bills", dateTime: "2026-01-05T12:00:00", assigneeIds: ["dad"], category: "Budget" })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.category).toBe("Budget");
  });

  it("silently drops an invalid category to null rather than rejecting the request", async () => {
    // Regression/documentation test: EVENT_CATEGORIES.includes(body?.category) simply
    // falls through to null for anything not in the fixed set — there was no test
    // proving this is the intended behavior (vs. a validation bug) before this.
    const res = await POST(
      postReq("dad", {
        title: "Mystery event",
        dateTime: "2026-01-05T12:00:00",
        assigneeIds: ["dad"],
        category: "Not A Real Category",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.category).toBeNull();
  });

  it("creates the event with the requesting user as creator and canEdit true", async () => {
    const res = await POST(
      postReq("malachi", { title: "Homework", dateTime: "2026-01-05T12:00:00", assigneeIds: ["malachi"] })
    );
    const body = await res.json();
    expect(body.createdBy).toBe("malachi");
    expect(body.canEdit).toBe(true);
    expect(body.assigneeIds).toEqual(["malachi"]);
  });

  it("generates future occurrences immediately when a recurrence is set", async () => {
    const res = await POST(
      postReq("dad", {
        title: "Weekly Standup",
        dateTime: "2026-01-05T09:00:00",
        assigneeIds: ["dad"],
        recurrence: "weekly",
      })
    );
    const body = await res.json();
    expect(body.recurrenceId).not.toBeNull();

    const rows = getDb()
      .prepare(`SELECT COUNT(*) as n FROM events WHERE recurrence_id = ?`)
      .get(body.recurrenceId) as { n: number };
    // Root occurrence + however many the ~3-month rolling window tops up —
    // at minimum, more than just the one row just inserted.
    expect(rows.n).toBeGreaterThan(1);
  });

  it("ignores an unrecognized recurrence value instead of creating a series", async () => {
    const res = await POST(
      postReq("dad", {
        title: "One-off",
        dateTime: "2026-01-05T09:00:00",
        assigneeIds: ["dad"],
        recurrence: "hourly",
      })
    );
    const body = await res.json();
    expect(body.recurrenceId).toBeNull();
  });
});
