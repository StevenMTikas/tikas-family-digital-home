process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { GET } from "./route";

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin')`
  ).run();
});

beforeEach(() => {
  getDb().exec(`DELETE FROM homework_details; DELETE FROM tasks; DELETE FROM subjects;`);
});

function getReq(userId: string | null) {
  return new NextRequest("http://localhost/api/subjects", { headers: userId ? { "x-user-id": userId } : {} });
}

describe("GET /api/subjects", () => {
  it("requires authentication", async () => {
    const res = await GET(getReq(null));
    expect(res.status).toBe(401);
  });

  it("lists subjects alphabetically with a homework count", async () => {
    const db = getDb();
    const mathId = randomUUID();
    const readingId = randomUUID();
    db.prepare(`INSERT INTO subjects (id, name, created_by) VALUES (?, 'Math', 'dad')`).run(mathId);
    db.prepare(`INSERT INTO subjects (id, name, created_by) VALUES (?, 'Reading', 'dad')`).run(readingId);

    const taskId = randomUUID();
    db.prepare(
      `INSERT INTO tasks (id, title, owner_id, due_date, status, created_by, assigned_by, visibility)
       VALUES (?, 'Lesson 1', 'dad', '2026-01-05', 'not_done', 'dad', 'dad', 'public')`
    ).run(taskId);
    db.prepare(`INSERT INTO homework_details (task_id, subject_id) VALUES (?, ?)`).run(taskId, mathId);

    const res = await GET(getReq("dad"));
    const body = await res.json();
    expect(body).toEqual([
      { id: mathId, name: "Math", homeworkCount: 1 },
      { id: readingId, name: "Reading", homeworkCount: 0 },
    ]);
  });
});
