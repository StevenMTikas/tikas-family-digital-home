process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
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
  getDb().exec(`DELETE FROM homework_details; DELETE FROM tasks; DELETE FROM subjects;`);
});

function getReq(userId: string | null) {
  return new NextRequest("http://localhost/api/tasks", { headers: userId ? { "x-user-id": userId } : {} });
}

function postReq(userId: string | null, body: unknown) {
  return new NextRequest("http://localhost/api/tasks", {
    method: "POST",
    headers: { "x-user-id": userId ?? "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/tasks", () => {
  it("requires authentication", async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/tasks — plain tasks unaffected", () => {
  it("creates a plain task with no homework fields when subject is omitted", async () => {
    const res = await POST(postReq("malachi", { title: "Clean room", dueDate: "2026-01-05" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.subjectId).toBeNull();
    expect(body.subjectName).toBeNull();
    expect(getDb().prepare(`SELECT * FROM homework_details WHERE task_id = ?`).get(body.id)).toBeUndefined();
  });
});

describe("POST /api/tasks — homework", () => {
  it("creates the subject on the fly and links a Homework_Detail row", async () => {
    const res = await POST(
      postReq("malachi", {
        title: "Reading Log",
        dueDate: "2026-01-05",
        subject: "Reading",
        curriculumReference: "Week 3",
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.subjectName).toBe("Reading");
    expect(body.curriculumReference).toBe("Week 3");

    const subject = getDb().prepare(`SELECT * FROM subjects WHERE name = 'Reading'`).get() as { id: string };
    expect(subject).toBeDefined();
    const detail = getDb().prepare(`SELECT * FROM homework_details WHERE task_id = ?`).get(body.id) as {
      subject_id: string;
    };
    expect(detail.subject_id).toBe(subject.id);
  });

  it("reuses an existing subject by name rather than creating a duplicate", async () => {
    await POST(postReq("malachi", { title: "A", dueDate: "2026-01-05", subject: "Math" }));
    await POST(postReq("malachi", { title: "B", dueDate: "2026-01-06", subject: "Math" }));
    const count = (getDb().prepare(`SELECT COUNT(*) AS c FROM subjects WHERE name = 'Math'`).get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it("rejects a Basic User setting grade fields on their own self-assigned homework", async () => {
    const res = await POST(
      postReq("malachi", { title: "Reading Log", dueDate: "2026-01-05", subject: "Reading", gradeOrScore: "A+" })
    );
    expect(res.status).toBe(403);
  });

  it("lets an Admin scoped to the child set grade fields when assigning homework", async () => {
    const res = await POST(
      postReq("vee", {
        title: "Reading Log",
        dueDate: "2026-01-05",
        ownerId: "malachi",
        subject: "Reading",
        gradeOrScore: "Complete",
        signedOff: true,
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.gradeOrScore).toBe("Complete");
    expect(body.signedOffBy).toBe("vee");
    expect(body.signedOffAt).not.toBeNull();
  });

  it("carries a homework series' subject forward onto generated future occurrences", async () => {
    const res = await POST(
      postReq("malachi", { title: "Reading Log", dueDate: "2026-01-05", subject: "Reading", recurrence: "daily" })
    );
    const body = await res.json();
    const occurrences = getDb()
      .prepare(
        `SELECT hd.subject_id FROM tasks t JOIN homework_details hd ON hd.task_id = t.id WHERE t.recurrence_id = ?`
      )
      .all(body.recurrenceId) as { subject_id: string }[];
    expect(occurrences.length).toBeGreaterThan(1);
    expect(occurrences.every((o) => o.subject_id === body.subjectId)).toBe(true);
  });
});
