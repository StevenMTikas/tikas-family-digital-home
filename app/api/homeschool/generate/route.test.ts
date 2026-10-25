process.env.DATABASE_PATH = ":memory:";

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, it, expect, vi } from "vitest";
import { getDb } from "@/db/client";

const mockFetchMaterial = vi.fn();
const mockGeneratePlan = vi.fn();

vi.mock("@/lib/core/homework/fetch-material", () => ({
  fetchCurriculumMaterial: (...args: unknown[]) => mockFetchMaterial(...args),
}));
vi.mock("@/lib/core/ai/frontier", () => ({
  generateCurriculumPlan: (...args: unknown[]) => mockGeneratePlan(...args),
}));

import { POST } from "./route";

beforeAll(() => {
  const db = getDb();
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, approve_outside_calls) VALUES ('dad', 'dad.test', 'x', 'Dad', 'super_admin', 1)`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role, admin_scope, approve_outside_calls) VALUES ('vee', 'vee.test', 'x', 'Vee', 'admin', '["malachi"]', 0)`
  ).run();
  db.prepare(
    `INSERT INTO users (id, username, password_hash, full_name, role) VALUES ('malachi', 'malachi.test', 'x', 'Malachi', 'basic_user')`
  ).run();
});

beforeEach(() => {
  getDb().exec(
    `DELETE FROM assignment_drafts; DELETE FROM curriculum_links; DELETE FROM school_year_blackouts; DELETE FROM school_years; DELETE FROM homework_details; DELETE FROM tasks; DELETE FROM subjects;`
  );
  mockFetchMaterial.mockReset();
  mockGeneratePlan.mockReset();
});

function makeSubjectWithLink(): string {
  const db = getDb();
  const subjectId = randomUUID();
  db.prepare(`INSERT INTO subjects (id, name, created_by) VALUES (?, 'Math', 'dad')`).run(subjectId);
  db.prepare(`INSERT INTO curriculum_links (id, subject_id, url, added_by) VALUES (?, ?, 'https://example.com/math', 'dad')`).run(
    randomUUID(),
    subjectId
  );
  return subjectId;
}

function makeSchoolYear() {
  getDb()
    .prepare(`INSERT INTO school_years (id, child_id, start_date, end_date, created_by) VALUES (?, 'malachi', '2026-09-01', '2027-06-01', 'dad')`)
    .run(randomUUID());
}

function postReq(userId: string | null, body: unknown) {
  return new NextRequest("http://localhost/api/homeschool/generate", {
    method: "POST",
    headers: { "x-user-id": userId ?? "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/homeschool/generate", () => {
  it("requires authentication", async () => {
    const res = await POST(postReq(null, { subjectId: "x", childId: "malachi", minPerWeek: 2, maxPerWeek: 4 }));
    expect(res.status).toBe(401);
  });

  it("rejects invalid min/max pacing", async () => {
    const subjectId = makeSubjectWithLink();
    const res = await POST(postReq("dad", { subjectId, childId: "malachi", minPerWeek: 4, maxPerWeek: 2 }));
    expect(res.status).toBe(400);
  });

  it("rejects a user with no admin authority over the child", async () => {
    const subjectId = makeSubjectWithLink();
    const res = await POST(postReq("malachi", { subjectId, childId: "malachi", minPerWeek: 2, maxPerWeek: 4 }));
    expect(res.status).toBe(403);
  });

  it("rejects an Admin without Approve Outside Calls, even though they have authority over the child", async () => {
    const subjectId = makeSubjectWithLink();
    makeSchoolYear();
    const res = await POST(postReq("vee", { subjectId, childId: "malachi", minPerWeek: 2, maxPerWeek: 4 }));
    expect(res.status).toBe(403);
    expect(mockFetchMaterial).not.toHaveBeenCalled();
  });

  it("requires a curriculum link on the subject first", async () => {
    const db = getDb();
    const subjectId = randomUUID();
    db.prepare(`INSERT INTO subjects (id, name, created_by) VALUES (?, 'Science', 'dad')`).run(subjectId);
    makeSchoolYear();
    const res = await POST(postReq("dad", { subjectId, childId: "malachi", minPerWeek: 2, maxPerWeek: 4 }));
    expect(res.status).toBe(400);
  });

  it("requires the child's school year to be set first", async () => {
    const subjectId = makeSubjectWithLink();
    const res = await POST(postReq("dad", { subjectId, childId: "malachi", minPerWeek: 2, maxPerWeek: 4 }));
    expect(res.status).toBe(400);
  });

  it("surfaces a fetch failure as a 502 without calling the AI", async () => {
    const subjectId = makeSubjectWithLink();
    makeSchoolYear();
    mockFetchMaterial.mockRejectedValue(new Error("Couldn't fetch https://example.com/math (HTTP 404)."));
    const res = await POST(postReq("dad", { subjectId, childId: "malachi", minPerWeek: 2, maxPerWeek: 4 }));
    expect(res.status).toBe(502);
    expect(mockGeneratePlan).not.toHaveBeenCalled();
  });

  it("creates pending drafts from a successful generation", async () => {
    const subjectId = makeSubjectWithLink();
    makeSchoolYear();
    mockFetchMaterial.mockResolvedValue("Chapter 1 text");
    mockGeneratePlan.mockResolvedValue([
      { title: "Lesson 1", dueDate: "2026-09-07", curriculumReference: "Ch 1" },
      { title: "Lesson 2", dueDate: "2026-09-09", curriculumReference: "Ch 1" },
    ]);

    const res = await POST(postReq("dad", { subjectId, childId: "malachi", minPerWeek: 2, maxPerWeek: 4 }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.drafts).toHaveLength(2);
    expect(body.drafts.every((d: { status: string }) => d.status === "pending")).toBe(true);

    const count = (getDb().prepare(`SELECT COUNT(*) AS c FROM assignment_drafts WHERE subject_id = ?`).get(subjectId) as { c: number }).c;
    expect(count).toBe(2);
  });

  it("discards a subject's prior pending batch when generating again", async () => {
    const subjectId = makeSubjectWithLink();
    makeSchoolYear();
    mockFetchMaterial.mockResolvedValue("text");
    mockGeneratePlan.mockResolvedValueOnce([{ title: "Old draft", dueDate: "2026-09-07", curriculumReference: "" }]);
    await POST(postReq("dad", { subjectId, childId: "malachi", minPerWeek: 2, maxPerWeek: 4 }));

    mockGeneratePlan.mockResolvedValueOnce([{ title: "New draft", dueDate: "2026-09-08", curriculumReference: "" }]);
    await POST(postReq("dad", { subjectId, childId: "malachi", minPerWeek: 2, maxPerWeek: 4 }));

    const rows = getDb()
      .prepare(`SELECT title FROM assignment_drafts WHERE subject_id = ? AND status = 'pending'`)
      .all(subjectId) as { title: string }[];
    expect(rows.map((r) => r.title)).toEqual(["New draft"]);
  });

  it("does not discard an already-approved draft when regenerating", async () => {
    const subjectId = makeSubjectWithLink();
    makeSchoolYear();
    const db = getDb();
    db.prepare(
      `INSERT INTO assignment_drafts (id, subject_id, child_id, generation_batch_id, title, suggested_due_date, status)
       VALUES (?, ?, 'malachi', 'old-batch', 'Already approved', '2026-09-07', 'approved')`
    ).run(randomUUID(), subjectId);

    mockFetchMaterial.mockResolvedValue("text");
    mockGeneratePlan.mockResolvedValue([{ title: "New draft", dueDate: "2026-09-08", curriculumReference: "" }]);
    await POST(postReq("dad", { subjectId, childId: "malachi", minPerWeek: 2, maxPerWeek: 4 }));

    const approvedStillThere = db.prepare(`SELECT * FROM assignment_drafts WHERE title = 'Already approved'`).get();
    expect(approvedStillThere).toBeDefined();
  });
});
