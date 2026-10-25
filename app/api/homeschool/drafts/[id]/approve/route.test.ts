process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { POST } from "./route";

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../../../db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin')`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('malachi', 'malachi.test', 'x', 'Malachi', 'basic_user')`
  ).run();
});

beforeEach(() => {
  getDb().exec(`DELETE FROM assignment_drafts; DELETE FROM homework_details; DELETE FROM tasks; DELETE FROM subjects;`);
});

function makeDraft(status: "pending" | "approved" = "pending"): { draftId: string; subjectId: string } {
  const db = getDb();
  const subjectId = randomUUID();
  db.prepare(`INSERT INTO subjects (id, name, created_by) VALUES (?, 'Math', 'dad')`).run(subjectId);
  const draftId = randomUUID();
  db.prepare(
    `INSERT INTO assignment_drafts (id, subject_id, child_id, generation_batch_id, title, curriculum_reference, suggested_due_date, status)
     VALUES (?, ?, 'malachi', 'batch1', 'Lesson 1', 'Ch 1', '2026-09-07', ?)`
  ).run(draftId, subjectId, status);
  return { draftId, subjectId };
}

function postReq(userId: string | null) {
  return new NextRequest("http://localhost/api/homeschool/drafts/x/approve", {
    method: "POST",
    headers: userId ? { "x-user-id": userId } : {},
  });
}

describe("POST /api/homeschool/drafts/[id]/approve", () => {
  it("rejects a Basic User", async () => {
    const { draftId } = makeDraft();
    const res = await POST(postReq("malachi"), { params: Promise.resolve({ id: draftId }) });
    expect(res.status).toBe(403);
  });

  it("blocks approving an already-approved draft", async () => {
    const { draftId } = makeDraft("approved");
    const res = await POST(postReq("dad"), { params: Promise.resolve({ id: draftId }) });
    expect(res.status).toBe(409);
  });

  it("creates a real Task + Homework_Detail row and marks the draft approved", async () => {
    const { draftId, subjectId } = makeDraft();
    const res = await POST(postReq("dad"), { params: Promise.resolve({ id: draftId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("approved");

    const db = getDb();
    const task = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(body.taskId) as {
      title: string;
      owner_id: string;
      due_date: string;
      visibility: string;
      assigned_by: string;
    };
    expect(task.title).toBe("Lesson 1");
    expect(task.owner_id).toBe("malachi");
    expect(task.due_date).toBe("2026-09-07");
    expect(task.visibility).toBe("public");
    expect(task.assigned_by).toBe("dad");

    const detail = db.prepare(`SELECT * FROM homework_details WHERE task_id = ?`).get(body.taskId) as {
      subject_id: string;
      curriculum_reference: string;
    };
    expect(detail.subject_id).toBe(subjectId);
    expect(detail.curriculum_reference).toBe("Ch 1");

    const draft = db.prepare(`SELECT status, approved_task_id FROM assignment_drafts WHERE id = ?`).get(draftId) as {
      status: string;
      approved_task_id: string;
    };
    expect(draft.status).toBe("approved");
    expect(draft.approved_task_id).toBe(body.taskId);
  });
});
