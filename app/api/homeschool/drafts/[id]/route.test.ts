process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { getDb } from "@/db/client";
import { PATCH, DELETE } from "./route";

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../../db/schema.sql"), "utf8"));
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

function makeDraft(status: "pending" | "approved" = "pending"): string {
  const db = getDb();
  const subjectId = randomUUID();
  db.prepare(`INSERT INTO subjects (id, name, created_by) VALUES (?, 'Math', 'dad')`).run(subjectId);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO assignment_drafts (id, subject_id, child_id, generation_batch_id, title, curriculum_reference, suggested_due_date, status)
     VALUES (?, ?, 'malachi', 'batch1', 'Lesson 1', 'Ch 1', '2026-09-07', ?)`
  ).run(id, subjectId, status);
  return id;
}

function patchReq(userId: string | null, body: unknown) {
  return new NextRequest("http://localhost/api/homeschool/drafts/x", {
    method: "PATCH",
    headers: { "x-user-id": userId ?? "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(userId: string | null) {
  return new NextRequest("http://localhost/api/homeschool/drafts/x", {
    method: "DELETE",
    headers: userId ? { "x-user-id": userId } : {},
  });
}

describe("PATCH /api/homeschool/drafts/[id]", () => {
  it("rejects a Basic User", async () => {
    const id = makeDraft();
    const res = await PATCH(patchReq("malachi", { title: "Edited" }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(403);
  });

  it("edits title/due date/curriculum reference on a pending draft", async () => {
    const id = makeDraft();
    const res = await PATCH(
      patchReq("dad", { title: "Edited Lesson", suggestedDueDate: "2026-09-08", curriculumReference: "Ch 2" }),
      { params: Promise.resolve({ id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe("Edited Lesson");
    expect(body.suggestedDueDate).toBe("2026-09-08");
    expect(body.curriculumReference).toBe("Ch 2");
  });

  it("blocks editing an already-approved draft", async () => {
    const id = makeDraft("approved");
    const res = await PATCH(patchReq("dad", { title: "Edited" }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/homeschool/drafts/[id]", () => {
  it("rejects (deletes outright, no history) a pending draft", async () => {
    const id = makeDraft();
    const res = await DELETE(deleteReq("dad"), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(204);
    expect(getDb().prepare(`SELECT * FROM assignment_drafts WHERE id = ?`).get(id)).toBeUndefined();
  });

  it("blocks rejecting an already-approved draft", async () => {
    const id = makeDraft("approved");
    const res = await DELETE(deleteReq("dad"), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(409);
  });
});
