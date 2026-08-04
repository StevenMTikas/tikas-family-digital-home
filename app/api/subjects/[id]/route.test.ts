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
});

beforeEach(() => {
  getDb().exec(`DELETE FROM homework_details; DELETE FROM tasks; DELETE FROM subjects;`);
});

function patchReq(userId: string | null, body: unknown) {
  return new NextRequest("http://localhost/api/subjects/x", {
    method: "PATCH",
    headers: { "x-user-id": userId ?? "", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(userId: string | null) {
  return new NextRequest("http://localhost/api/subjects/x", {
    method: "DELETE",
    headers: userId ? { "x-user-id": userId } : {},
  });
}

function makeSubject(name = "Math"): string {
  const id = randomUUID();
  getDb().prepare(`INSERT INTO subjects (id, name, created_by) VALUES (?, ?, 'dad')`).run(id, name);
  return id;
}

describe("PATCH /api/subjects/[id]", () => {
  it("requires authentication", async () => {
    const id = makeSubject();
    const res = await PATCH(patchReq(null, { name: "Science" }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(401);
  });

  it("rejects a non-Super-Admin", async () => {
    const id = makeSubject();
    const res = await PATCH(patchReq("vee", { name: "Science" }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(403);
  });

  it("renames a subject", async () => {
    const id = makeSubject();
    const res = await PATCH(patchReq("dad", { name: "Science" }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Science");
  });

  it("rejects a rename that collides with another subject's name", async () => {
    makeSubject("Science");
    const id = makeSubject("Math");
    const res = await PATCH(patchReq("dad", { name: "Science" }), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(409);
  });

  it("404s for an unknown subject", async () => {
    const res = await PATCH(patchReq("dad", { name: "Science" }), { params: Promise.resolve({ id: "ghost" }) });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/subjects/[id]", () => {
  it("rejects a non-Super-Admin", async () => {
    const id = makeSubject();
    const res = await DELETE(deleteReq("vee"), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(403);
  });

  it("deletes an unused subject", async () => {
    const id = makeSubject();
    const res = await DELETE(deleteReq("dad"), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(204);
    expect(getDb().prepare(`SELECT * FROM subjects WHERE id = ?`).get(id)).toBeUndefined();
  });

  it("blocks deleting a subject still used by a homework item", async () => {
    const db = getDb();
    const id = makeSubject();
    const taskId = randomUUID();
    db.prepare(
      `INSERT INTO tasks (id, title, owner_id, due_date, status, created_by, assigned_by, visibility)
       VALUES (?, 'Lesson 1', 'dad', '2026-01-05', 'not_done', 'dad', 'dad', 'public')`
    ).run(taskId);
    db.prepare(`INSERT INTO homework_details (task_id, subject_id) VALUES (?, ?)`).run(taskId, id);

    const res = await DELETE(deleteReq("dad"), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(409);
    expect(getDb().prepare(`SELECT * FROM subjects WHERE id = ?`).get(id)).toBeDefined();
  });
});
