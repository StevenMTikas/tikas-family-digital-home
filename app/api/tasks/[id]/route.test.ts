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
  db.exec(fs.readFileSync(path.resolve(__dirname, "../../../../db/schema.sql"), "utf8"));
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

function patchReq(userId: string | null, body: unknown) {
  return new NextRequest("http://localhost/api/tasks/x", {
    method: "PATCH",
    headers: { "x-user-id": userId ?? "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(userId: string | null) {
  return new NextRequest("http://localhost/api/tasks/x", {
    method: "DELETE",
    headers: userId ? { "x-user-id": userId } : {},
  });
}

// Malachi self-assigns his own reading-log homework — owner_id, created_by,
// and assigned_by are all 'malachi', same as any self-assigned Task.
function makeMalachiHomework(): string {
  const db = getDb();
  const taskId = randomUUID();
  db.prepare(
    `INSERT INTO tasks (id, title, owner_id, due_date, status, created_by, assigned_by, visibility)
     VALUES (?, 'Reading Log', 'malachi', '2026-01-05', 'not_done', 'malachi', 'malachi', 'public')`
  ).run(taskId);
  const subjectId = randomUUID();
  db.prepare(`INSERT INTO subjects (id, name, created_by) VALUES (?, 'Reading', 'malachi')`).run(subjectId);
  db.prepare(`INSERT INTO homework_details (task_id, subject_id) VALUES (?, ?)`).run(taskId, subjectId);
  return taskId;
}

describe("PATCH /api/tasks/[id] — homework grading permission", () => {
  // The core scenario from Homeschool.md's Permissions section: Malachi can
  // self-assign and edit his own homework Task, but even though he's his
  // own "assigner" (which normally grants edit rights per Tasks.md), he
  // cannot write his own grade/notes/sign-off.
  it("blocks Malachi from grading his own self-assigned homework, even though he can edit it", async () => {
    const id = makeMalachiHomework();

    const editRes = await PATCH(patchReq("malachi", { curriculumReference: "Week 4" }), {
      params: Promise.resolve({ id }),
    });
    expect(editRes.status).toBe(200);

    const gradeRes = await PATCH(patchReq("malachi", { gradeOrScore: "A+" }), { params: Promise.resolve({ id }) });
    expect(gradeRes.status).toBe(403);

    const notesRes = await PATCH(patchReq("malachi", { parentNotes: "Great job" }), {
      params: Promise.resolve({ id }),
    });
    expect(notesRes.status).toBe(403);

    const signOffRes = await PATCH(patchReq("malachi", { signedOff: true }), { params: Promise.resolve({ id }) });
    expect(signOffRes.status).toBe(403);
  });

  it("lets Vee (Malachi's scoped Admin) grade and sign off on Malachi's homework", async () => {
    const id = makeMalachiHomework();
    const res = await PATCH(
      patchReq("vee", { gradeOrScore: "Complete", parentNotes: "Read the whole chapter.", signedOff: true }),
      { params: Promise.resolve({ id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.gradeOrScore).toBe("Complete");
    expect(body.parentNotes).toBe("Read the whole chapter.");
    expect(body.signedOffBy).toBe("vee");
    expect(body.signedOffAt).not.toBeNull();
  });

  it("clearing signedOff removes the sign-off stamp", async () => {
    const id = makeMalachiHomework();
    await PATCH(patchReq("vee", { signedOff: true }), { params: Promise.resolve({ id }) });
    const res = await PATCH(patchReq("vee", { signedOff: false }), { params: Promise.resolve({ id }) });
    const body = await res.json();
    expect(body.signedOffBy).toBeNull();
    expect(body.signedOffAt).toBeNull();
  });

  it("reports canGrade: false for Malachi and true for Vee on the same task", async () => {
    const id = makeMalachiHomework();
    const asMalachi = await PATCH(patchReq("malachi", { curriculumReference: "Week 5" }), {
      params: Promise.resolve({ id }),
    });
    expect((await asMalachi.json()).canGrade).toBe(false);

    const asVee = await PATCH(patchReq("vee", { parentNotes: "ok" }), { params: Promise.resolve({ id }) });
    expect((await asVee.json()).canGrade).toBe(true);
  });
});

describe("PATCH /api/tasks/[id] — subject changes", () => {
  it("clearing subject to an empty string removes the homework link entirely", async () => {
    const id = makeMalachiHomework();
    const res = await PATCH(patchReq("malachi", { subject: "" }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjectId).toBeNull();
    expect(getDb().prepare(`SELECT * FROM homework_details WHERE task_id = ?`).get(id)).toBeUndefined();
  });

  it("changing subject on an existing homework task swaps subject_id without creating a duplicate row", async () => {
    const id = makeMalachiHomework();
    const res = await PATCH(patchReq("malachi", { subject: "Math" }), { params: Promise.resolve({ id }) });
    const body = await res.json();
    expect(body.subjectName).toBe("Math");
    const count = (
      getDb().prepare(`SELECT COUNT(*) AS c FROM homework_details WHERE task_id = ?`).get(id) as { c: number }
    ).c;
    expect(count).toBe(1);
  });

  it("adding a subject to a plain task turns it into homework", async () => {
    const db = getDb();
    const taskId = randomUUID();
    db.prepare(
      `INSERT INTO tasks (id, title, owner_id, due_date, status, created_by, assigned_by, visibility)
       VALUES (?, 'Clean room', 'malachi', '2026-01-05', 'not_done', 'malachi', 'malachi', 'public')`
    ).run(taskId);

    const res = await PATCH(patchReq("malachi", { subject: "Science" }), { params: Promise.resolve({ id: taskId }) });
    expect(res.status).toBe(200);
    expect((await res.json()).subjectName).toBe("Science");
  });

  it("forces visibility to public when a subject is set in the same request that tries to go private", async () => {
    const db = getDb();
    const taskId = randomUUID();
    db.prepare(
      `INSERT INTO tasks (id, title, owner_id, due_date, status, created_by, assigned_by, visibility)
       VALUES (?, 'Clean room', 'malachi', '2026-01-05', 'not_done', 'malachi', 'malachi', 'public')`
    ).run(taskId);

    const res = await PATCH(patchReq("malachi", { subject: "Science", visibility: "private" }), {
      params: Promise.resolve({ id: taskId }),
    });
    expect((await res.json()).visibility).toBe("public");
  });

  it("blocks setting an already-homework task to private, even without touching subject", async () => {
    const id = makeMalachiHomework();
    const res = await PATCH(patchReq("malachi", { visibility: "private" }), { params: Promise.resolve({ id }) });
    expect((await res.json()).visibility).toBe("public");
  });
});

describe("DELETE /api/tasks/[id] — homework cleanup", () => {
  it("deletes the linked Homework_Detail row along with the task", async () => {
    const id = makeMalachiHomework();
    const res = await DELETE(deleteReq("malachi"), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(204);
    expect(getDb().prepare(`SELECT * FROM homework_details WHERE task_id = ?`).get(id)).toBeUndefined();
    expect(getDb().prepare(`SELECT * FROM tasks WHERE id = ?`).get(id)).toBeUndefined();
  });
});
